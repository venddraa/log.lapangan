export const memberCodes = ['vendra', 'acan', 'hudda', 'adit', 'henry'] as const

export type MemberCode = (typeof memberCodes)[number]

export function isMemberCode(value: string): value is MemberCode {
  return memberCodes.includes(value as MemberCode)
}

export function getMemberEmail(memberCode: MemberCode) {
  return `${memberCode}@fieldlog.internal`
}

export function getMemberPassword(memberCode: MemberCode, pin: string) {
  return `field-log/${memberCode}/${pin}`
}
