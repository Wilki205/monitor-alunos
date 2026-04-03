import { google } from 'googleapis'
import { pool } from '../config/db.js'
import { env } from '../config/env.js'

const TRACKED_KEYWORDS = ['desafio', 'miniprojeto', 'mini-projeto', 'mini projeto']
const BLOCKED_KEYWORDS = ['feedback', 'apresentacao', 'apresentação', 'duvidas', 'dúvidas']

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function isTrackedAssignment(title) {
  const normalized = normalizeText(title)

  const hasAllowed = TRACKED_KEYWORDS.some(word =>
    normalized.includes(normalizeText(word))
  )

  const hasBlocked = BLOCKED_KEYWORDS.some(word =>
    normalized.includes(normalizeText(word))
  )

  return hasAllowed && !hasBlocked
}

function buildDueDate(courseWork) {
  if (!courseWork?.dueDate) return null

  const year = courseWork.dueDate.year
  const month = courseWork.dueDate.month
  const day = courseWork.dueDate.day
  const hours = courseWork.dueTime?.hours || 0
  const minutes = courseWork.dueTime?.minutes || 0
  const seconds = courseWork.dueTime?.seconds || 0

  return new Date(year, month - 1, day, hours, minutes, seconds)
}

async function upsertCourse(client, course) {
  const result = await client.query(
    `
    INSERT INTO courses (
      google_course_id, name, section, status, description, room, owner_id, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (google_course_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      section = EXCLUDED.section,
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      room = EXCLUDED.room,
      owner_id = EXCLUDED.owner_id,
      updated_at = NOW()
    RETURNING id
    `,
    [
      String(course.id),
      course.name || 'Sem nome',
      course.section || null,
      course.courseState || null,
      course.description || null,
      course.room || null,
      course.ownerId || null
    ]
  )

  return result.rows[0].id
}

async function upsertStudent(client, student) {
  const profile = student.profile || {}

  const result = await client.query(
    `
    INSERT INTO students (
      google_student_id, name, email, updated_at
    )
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (google_student_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      updated_at = NOW()
    RETURNING id
    `,
    [
      String(student.userId),
      profile.name?.fullName || 'Sem nome',
      profile.emailAddress || null
    ]
  )

  return result.rows[0].id
}

async function linkStudentToCourse(client, courseId, studentId) {
  await client.query(
    `
    INSERT INTO course_students (course_id, student_id)
    VALUES ($1, $2)
    ON CONFLICT (course_id, student_id) DO NOTHING
    `,
    [courseId, studentId]
  )
}

async function upsertAssignment(client, courseId, courseWork) {
  const result = await client.query(
    `
    INSERT INTO assignments (
      google_assignment_id,
      course_id,
      title,
      description,
      work_type,
      max_points,
      due_date,
      alternate_link,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (google_assignment_id)
    DO UPDATE SET
      course_id = EXCLUDED.course_id,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      work_type = EXCLUDED.work_type,
      max_points = EXCLUDED.max_points,
      due_date = EXCLUDED.due_date,
      alternate_link = EXCLUDED.alternate_link,
      updated_at = NOW()
    RETURNING id
    `,
    [
      String(courseWork.id),
      courseId,
      courseWork.title || 'Sem título',
      courseWork.description || null,
      courseWork.workType || null,
      courseWork.maxPoints || null,
      buildDueDate(courseWork),
      courseWork.alternateLink || null
    ]
  )

  return result.rows[0].id
}

async function upsertSubmission(client, assignmentId, studentId, submission) {
  await client.query(
    `
    INSERT INTO submissions (
      assignment_id,
      student_id,
      google_submission_id,
      state,
      assigned_grade,
      draft_grade,
      late,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (assignment_id, student_id)
    DO UPDATE SET
      google_submission_id = EXCLUDED.google_submission_id,
      state = EXCLUDED.state,
      assigned_grade = EXCLUDED.assigned_grade,
      draft_grade = EXCLUDED.draft_grade,
      late = EXCLUDED.late,
      updated_at = NOW()
    `,
    [
      assignmentId,
      studentId,
      submission.id ? String(submission.id) : null,
      submission.state || null,
      submission.assignedGrade ?? null,
      submission.draftGrade ?? null,
      Boolean(submission.late)
    ]
  )
}

export async function syncGoogleClassroom() {
  const oauth2Client = new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri
  )

  oauth2Client.setCredentials({
    refresh_token: env.googleRefreshToken
  })

  const classroom = google.classroom({
    version: 'v1',
    auth: oauth2Client
  })

  const client = await pool.connect()

  const syncStart = await client.query(
    `
    INSERT INTO sync_runs (status, started_at, message)
    VALUES ('running', NOW(), 'Sincronização iniciada')
    RETURNING id
    `
  )

  const syncId = syncStart.rows[0].id

  try {
    await client.query('BEGIN')

    const coursesResponse = await classroom.courses.list({
      courseStates: ['ACTIVE'],
      pageSize: 100
    })

    const courses = coursesResponse.data.courses || []

    let totalCourses = 0
    let totalStudents = 0
    let totalAssignments = 0
    let totalSubmissions = 0

    for (const course of courses) {
      totalCourses++

      const localCourseId = await upsertCourse(client, course)

      const studentsResponse = await classroom.courses.students.list({
        courseId: course.id,
        pageSize: 100
      }).catch(() => ({ data: { students: [] } }))

      const classroomStudents = studentsResponse.data.students || []

      const studentMap = new Map()

      for (const student of classroomStudents) {
        const localStudentId = await upsertStudent(client, student)
        await linkStudentToCourse(client, localCourseId, localStudentId)

        studentMap.set(String(student.userId), localStudentId)
        totalStudents++
      }

      const courseWorkResponse = await classroom.courses.courseWork.list({
        courseId: course.id,
        pageSize: 100
      }).catch(() => ({ data: { courseWork: [] } }))

      const works = courseWorkResponse.data.courseWork || []

      for (const work of works) {
        if (!isTrackedAssignment(work.title)) continue

        const localAssignmentId = await upsertAssignment(client, localCourseId, work)
        totalAssignments++

        const submissionsResponse = await classroom.courses.courseWork.studentSubmissions.list({
          courseId: course.id,
          courseWorkId: work.id,
          pageSize: 100
        }).catch(() => ({ data: { studentSubmissions: [] } }))

        const studentSubmissions = submissionsResponse.data.studentSubmissions || []

        for (const submission of studentSubmissions) {
          const localStudentId = studentMap.get(String(submission.userId))
          if (!localStudentId) continue

          await upsertSubmission(client, localAssignmentId, localStudentId, submission)
          totalSubmissions++
        }
      }
    }

    await client.query('COMMIT')

    await client.query(
      `
      UPDATE sync_runs
      SET status = 'success',
          finished_at = NOW(),
          message = $1
      WHERE id = $2
      `,
      [
        `Sync concluída. Cursos: ${totalCourses}, Alunos: ${totalStudents}, Atividades: ${totalAssignments}, Submissões: ${totalSubmissions}`,
        syncId
      ]
    )

    return {
      syncId,
      status: 'success',
      totalCourses,
      totalStudents,
      totalAssignments,
      totalSubmissions
    }
  } catch (error) {
    await client.query('ROLLBACK')

    await client.query(
      `
      UPDATE sync_runs
      SET status = 'error',
          finished_at = NOW(),
          message = $1
      WHERE id = $2
      `,
      [error.message, syncId]
    )

    throw error
  } finally {
    client.release()
  }
}