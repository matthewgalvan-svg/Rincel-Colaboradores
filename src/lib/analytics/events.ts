/** Eventos permitidos (compartido con el navegador). */
export const CLIENT_EVENTS = ["page_view", "view_item", "add_to_cart", "remove_from_cart", "view_cart", "begin_checkout", "shipping_quote", "shipping_quote_error", "cta_click", "whatsapp_click", "compare_view", "helper_answer"] as const;

/** Eventos que solo registra el servidor (nunca el navegador). */
export const SERVER_EVENTS = ["payment_started", "purchase", "refund", "payment_rejected", "payment_pending", "label_error", "checkout_error"] as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[number];
export type ServerEventName = (typeof SERVER_EVENTS)[number];
export type AnalyticsEventName = ClientEventName | ServerEventName;
