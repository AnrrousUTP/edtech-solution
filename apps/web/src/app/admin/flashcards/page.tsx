import { redirect } from 'next/navigation'

/**
 * Flashcards se revisa dentro de cada semana del editor de curso.
 * Conservamos la ruta antigua para no dejar enlaces guardados apuntando a una
 * pantalla que ya no representa el contexto académico correcto.
 */
export default function FlashcardsLegacy(): never {
  redirect('/admin')
}
