import { whatsappLink } from "@/lib/format";

/** The pre-filled message is always in French (it goes to the client). */
export function readyMessage(input: { clientName: string; number: number; locationName: string; reste: number }): string {
  const reste = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(input.reste).replace(/ /g, " ");
  return `Bonjour ${input.clientName}, vos lunettes (commande n° ${input.number}) sont prêtes à la ${input.locationName}. Reste à payer : ${reste} DH. À bientôt !`;
}

export function readyWhatsAppLink(input: { phone: string; clientName: string; number: number; locationName: string; reste: number }): string {
  return whatsappLink(input.phone, readyMessage(input));
}

export function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
