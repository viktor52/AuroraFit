/** Matches names created by POST /api/athlete/generate-generic-program */
export function isAiGeneratedProgramName(name: string) {
  return name.trimStart().startsWith('AI:')
}
