import { redirect } from 'next/navigation'

export default async function PaginaDocente(): Promise<JSX.Element> {
  redirect('/admin')
}
