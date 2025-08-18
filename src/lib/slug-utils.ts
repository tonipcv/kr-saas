/**
 * Utilitários para geração e manipulação de slugs
 */

/**
 * Gera um slug a partir de uma string
 * @param text Texto para gerar o slug
 * @returns Slug gerado
 */
export function generateSlug(text: string): string {
  return text
    .toString()
    .normalize('NFD') // Normaliza caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/[^\w-]+/g, '') // Remove caracteres não alfanuméricos
    .replace(/--+/g, '-') // Substitui múltiplos hífens por um único
    .replace(/^-+/, '') // Remove hífens do início
    .replace(/-+$/, ''); // Remove hífens do final
}

/**
 * Gera um slug único para médico
 * @param name Nome do médico
 * @param id ID do médico (usado como fallback)
 * @returns Slug gerado
 */
export function generateDoctorSlug(name: string, id: string): string {
  if (!name || name.trim() === '') {
    return `dr-${id.substring(0, 8)}`;
  }
  
  const baseSlug = generateSlug(name);
  return baseSlug || `dr-${id.substring(0, 8)}`;
}

/**
 * Gera um link completo para a página do médico
 * @param slug Slug do médico
 * @returns URL completa para a página do médico
 */
export function generateDoctorLinkUrl(slug: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/doctor-link/${slug}`;
}
