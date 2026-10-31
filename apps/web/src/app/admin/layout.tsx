import { redirect } from 'next/navigation'
import { exigirRol } from '@/lib/sesion'

export default async function LayoutDocente({
  children,
}: {
  children: React.ReactNode
}): Promise<JSX.Element> {
  const perfil = await exigirRol('docente', '/admin')
  if (perfil.mfaPendiente) redirect('/configurar-mfa')
  return <>{children}</>
}
