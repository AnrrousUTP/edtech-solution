import { TerminalError } from '../module.errors'
export const validarMensaje = (mensaje: unknown): string => {
  if (typeof mensaje !== 'string' || mensaje.trim().length < 1 || mensaje.trim().length > 160)
    throw new TerminalError('MENSAJE_INVALIDO', 'El mensaje debe tener entre 1 y 160 caracteres')
  return mensaje.trim()
}
