import { ClientDetailPage } from "@/components/clients/client-detail";

export default async function Page({ params }: PageProps<"/[locale]/clients/[id]">) {
  const { id } = await params;
  return <ClientDetailPage id={id} />;
}
