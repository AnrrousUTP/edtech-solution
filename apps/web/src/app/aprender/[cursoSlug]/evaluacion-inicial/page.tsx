import { redirect } from 'next/navigation'

export default async function EvaluacionInicial({
  params,
}: {
  params: Promise<{ cursoSlug: string }>
}): Promise<JSX.Element> {
  const { cursoSlug } = await params
  redirect(`/aprender/${cursoSlug}`)
}
