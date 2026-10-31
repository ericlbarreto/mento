// Initials for the Avatar: first letter of the first and last words, uppercased ("Ana Beatriz Souza" → "AS").
// One word gives one letter; an empty name gives "?". Kept apart from Avatar.tsx so it is unit-tested.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letter = (word: string | undefined) => (word ? (Array.from(word)[0] ?? "") : "");
  const last = words.length > 1 ? letter(words[words.length - 1]) : "";
  return (letter(words[0]) + last).toLocaleUpperCase("pt-BR");
}
