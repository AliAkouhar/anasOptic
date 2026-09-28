import { OrderDetailPage } from "@/components/orders/order-detail";

export default async function Page({ params }: PageProps<"/[locale]/orders/[id]">) {
  const { id } = await params;
  return <OrderDetailPage id={id} />;
}
