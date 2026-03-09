export enum OrderStatus {
  COMPLETED = "completed",
  IN_DELIVERY = "in_delivery",
  TO_DELIVER = "to_deliver",
}

export interface OrderArticle {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  currency: string;
  image: string;
}

export interface Order {
  id: string;
  reference: string;
  customer_name: string;
  created_at: string;
  total: number;
  currency: string;
  status: OrderStatus;
  tags: string[];
  payment_method: string;
  transaction_id: string;
  customer_note: string;
  articles: OrderArticle[];
  billing_info: string;
  shipping_info: string;
  subtotal: number;
  shipping_cost: number;
}

export const MOCK_ORDERS: Order[] = [
  {
    id: "3213",
    reference: "Commande #3213",
    customer_name: "Jean Pierre Mendykkkkkkkkkkkkkkkkkk",
    created_at: "04/03/2026 14:05",
    total: 12000,
    currency: "XOF",
    status: OrderStatus.COMPLETED,
    tags: ["Livrée"],
    payment_method: "Paiement à la livraison",
    transaction_id: "TRX-3213",
    customer_note: "C 30028663275888",
    articles: [
      {
        id: "p1",
        name: "Article unique 3213",
        sku: "SKU3213-1",
        quantity: 1,
        price: 12000,
        currency: "XOF",
        image: "https://example.com/article-3213.jpg",
      },
    ],
    billing_info:
      "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN\nEmail: jean@example.com\nTél: +221 77 000 00 00",
    shipping_info: "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN",
    subtotal: 12000,
    shipping_cost: 0,
  },
  {
    id: "32134",
    reference: "Commande #3213",
    customer_name: "Jean Pierre Mendy",
    created_at: "04/03/2026 14:05",
    total: 12000,
    currency: "XOF",
    status: OrderStatus.COMPLETED,
    tags: ["Livrée"],
    payment_method: "Paiement à la livraison",
    transaction_id: "TRX-3213",
    customer_note: "C 30028663275888",
    articles: [
      {
        id: "p1",
        name: "Article unique 3213",
        sku: "SKU3213-1",
        quantity: 1,
        price: 12000,
        currency: "XOF",
        image: "https://example.com/article-3213.jpg",
      },
    ],
    billing_info:
      "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN\nEmail: jean@example.com\nTél: +221 77 000 00 00",
    shipping_info: "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN",
    subtotal: 12000,
    shipping_cost: 0,
  },
  {
    id: "32135",
    reference: "Commande #3213",
    customer_name: "Jean Pierre Mendy",
    created_at: "04/03/2026 14:05",
    total: 12000,
    currency: "XOF",
    status: OrderStatus.COMPLETED,
    tags: ["Livrée"],
    payment_method: "Paiement à la livraison",
    transaction_id: "TRX-3213",
    customer_note: "C 30028663275888",
    articles: [
      {
        id: "p1",
        name: "Article unique 3213",
        sku: "SKU3213-1",
        quantity: 1,
        price: 12000,
        currency: "XOF",
        image: "https://example.com/article-3213.jpg",
      },
    ],
    billing_info:
      "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN\nEmail: jean@example.com\nTél: +221 77 000 00 00",
    shipping_info: "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN",
    subtotal: 12000,
    shipping_cost: 0,
  },
  {
    id: "32136",
    reference: "Commande #3213",
    customer_name: "Jean Pierre Mendy",
    created_at: "04/03/2026 14:05",
    total: 12000,
    currency: "XOF",
    status: OrderStatus.COMPLETED,
    tags: ["Livrée"],
    payment_method: "Paiement à la livraison",
    transaction_id: "TRX-3213",
    customer_note: "C 30028663275888",
    articles: [
      {
        id: "p1",
        name: "Article unique 3213",
        sku: "SKU3213-1",
        quantity: 1,
        price: 12000,
        currency: "XOF",
        image: "https://example.com/article-3213.jpg",
      },
    ],
    billing_info:
      "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN\nEmail: jean@example.com\nTél: +221 77 000 00 00",
    shipping_info: "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN",
    subtotal: 12000,
    shipping_cost: 0,
  },
  {
    id: "32137",
    reference: "Commande #3213",
    customer_name: "Jean Pierre Mendy",
    created_at: "04/03/2026 14:05",
    total: 12000,
    currency: "XOF",
    status: OrderStatus.COMPLETED,
    tags: ["Livrée"],
    payment_method: "Paiement à la livraison",
    transaction_id: "TRX-3213",
    customer_note: "C 30028663275888",
    articles: [
      {
        id: "p1",
        name: "Article unique 3213",
        sku: "SKU3213-1",
        quantity: 1,
        price: 12000,
        currency: "XOF",
        image: "https://example.com/article-3213.jpg",
      },
    ],
    billing_info:
      "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN\nEmail: jean@example.com\nTél: +221 77 000 00 00",
    shipping_info: "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN",
    subtotal: 12000,
    shipping_cost: 0,
  },
  {
    id: "32138",
    reference: "Commande #3213",
    customer_name: "Jean Pierre Mendy",
    created_at: "04/03/2026 14:05",
    total: 12000,
    currency: "XOF",
    status: OrderStatus.COMPLETED,
    tags: ["Livrée"],
    payment_method: "Paiement à la livraison",
    transaction_id: "TRX-3213",
    customer_note: "C 30028663275888",
    articles: [
      {
        id: "p1",
        name: "Article unique 3213",
        sku: "SKU3213-1",
        quantity: 1,
        price: 12000,
        currency: "XOF",
        image: "https://example.com/article-3213.jpg",
      },
    ],
    billing_info:
      "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN\nEmail: jean@example.com\nTél: +221 77 000 00 00",
    shipping_info: "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN",
    subtotal: 12000,
    shipping_cost: 0,
  },
  {
    id: "32139",
    reference: "Commande #3213",
    customer_name: "Jean Pierre Mendy",
    created_at: "04/03/2026 14:05",
    total: 12000,
    currency: "XOF",
    status: OrderStatus.COMPLETED,
    tags: ["Livrée"],
    payment_method: "Paiement à la livraison",
    transaction_id: "TRX-3213",
    customer_note: "C 30028663275888",
    articles: [
      {
        id: "p1",
        name: "Article unique 3213",
        sku: "SKU3213-1",
        quantity: 1,
        price: 12000,
        currency: "XOF",
        image: "https://example.com/article-3213.jpg",
      },
    ],
    billing_info:
      "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN\nEmail: jean@example.com\nTél: +221 77 000 00 00",
    shipping_info: "Jean Pierre Mendy\n123 Rue de la Liberté\nDakar, SN",
    subtotal: 12000,
    shipping_cost: 0,
  },
  {
    id: "8269",
    reference: "Commande #8269",
    customer_name: "Houaichi Bassem",
    created_at: "03/03/2026 07:05",
    total: 87.8,
    currency: "TND",
    status: OrderStatus.COMPLETED,
    tags: ["Livrée"],
    payment_method: "Paiement à la livraison",
    transaction_id: "TRX-8269",
    customer_note: "C 30028663275888",
    articles: [
      {
        id: "a1",
        name: "Chéchia Tunisienne Verte En Laine - 60 cm",
        sku: "CHVRT60",
        quantity: 1,
        price: 39.9,
        currency: "TND",
        image: "https://example.com/chechia-verte.jpg",
      },
      {
        id: "a2",
        name: "Chechia tunisienne rouge en laine - 60 cm",
        sku: "CHROU60",
        quantity: 1,
        price: 39.9,
        currency: "TND",
        image: "https://example.com/chechia-rouge.jpg",
      },
      {
        id: "a3",
        name: "Chechia tunisienne bleue en laine - 58 cm",
        sku: "CHBLU58",
        quantity: 2,
        price: 39.9,
        currency: "TND",
        image: "https://example.com/chechia-bleu.jpg",
      },
      {
        id: "a4",
        name: "Chechia tunisienne bleue en laine - 58 cm",
        sku: "CHBLU58",
        quantity: 2,
        price: 39.9,
        currency: "TND",
        image: "https://example.com/chechia-bleu.jpg",
      },
    ],
    billing_info:
      "Houaichi Bassem\nRue de la douane kalaat sinan 7130\n7130 Kalaat Sinan, TN\nEmail: 98544638@noemail.com\nTél: 98544638",
    shipping_info:
      "Houaichi Bassem\nRue de la douane kalaat sinan 7130\n7130 Kalaat Sinan, TN",
    subtotal: 79.8,
    shipping_cost: 8.0,
  },
];

