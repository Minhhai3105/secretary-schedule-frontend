export function isSelf(person: string): boolean {
  return person === 'Me' || person === 'Tôi'
}

export function canonicalRelatedPerson(person: string): string {
  return isSelf(person) ? 'Me' : person
}

export function relatedPeopleOptions(people: string[]): string[] {
  return [...new Set(people.map(canonicalRelatedPerson))]
}
