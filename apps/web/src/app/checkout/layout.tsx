import { exigirRol } from '@/lib/sesion'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}): Promise<JSX.Element> {
  await exigirRol('estudiante', '/checkout')
  return <>{children}</>
}
