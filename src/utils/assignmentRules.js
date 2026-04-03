import { normalizeText } from './helpers'

export const PENDING_STATES = [
  'CREATED',
  'NEW',
  'RECLAIMED_BY_STUDENT',
  'MISSING'
]

export const DELIVERED_STATES = [
  'TURNED_IN',
  'RETURNED'
]

const allowedKeywords = [
  'desafio',
  'miniprojeto',
  'mini-projeto',
  'mini projeto'
]

const blockedKeywords = [
  'feedback',
  'apresentacao',
  'apresentação',
  'duvidas',
  'dúvidas'
]

export function isTrackedAssignment(assignment) {
  const title = normalizeText(assignment?.title)

  const hasAllowed = allowedKeywords.some(word =>
    title.includes(normalizeText(word))
  )

  const hasBlocked = blockedKeywords.some(word =>
    title.includes(normalizeText(word))
  )

  return hasAllowed && !hasBlocked
}