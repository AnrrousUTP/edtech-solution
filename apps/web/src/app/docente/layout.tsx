import { redirect } from 'next/navigation'
import { exigirRol } from '@/lib/sesion'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}): Promise<JSX.Element> {
  const perfil = await exigirRol('docente', '/docente')
  if (perfil.mfaPendiente) redirect('/configurar-mfa')
  return <>{children}</>
}
