import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

const prisma = new PrismaClient();

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const categories = [
  { id: "sneakers", name: "Sneakers", slug: "sneakers" },
  { id: "bags", name: "Bags", slug: "bags" },
  { id: "apparel", name: "Apparel", slug: "apparel" },
];

const products = [
  {
    id: "volt-runner",
    slug: "volt-runner",
    name: "VOLT Runner 01",
    tagline: "Knit upper. Zero excuses.",
    description:
      "A featherweight daily trainer built on a full-length foam midsole and a breathable engineered knit. Designed for city miles and late drops.",
    price: 16800,
    compareAt: 19800,
    categoryId: "sneakers",
    badge: "DROP",
    colors: ["Volt Red", "Neon"],
    sizes: ["7", "8", "9", "10", "11", "12"],
    images: [img("1542291026-7eec264c27ff"), img("1606107557195-0e29a4b5b4aa")],
    featured: true,
    stock: 24,
  },
  {
    id: "court-low",
    slug: "court-low",
    name: "COURT Low Suede",
    tagline: "Worn-in from day one.",
    description:
      "Premium suede court shoe with a gum-toned cupsole and padded collar. The pair you reach for when nothing else feels right.",
    price: 14200,
    compareAt: null,
    categoryId: "sneakers",
    badge: null,
    colors: ["Wheat", "Black"],
    sizes: ["7", "8", "9", "10", "11", "12"],
    images: [img("1549298916-b41d501d3772"), img("1491553895911-0055eca6402d")],
    featured: true,
    stock: 18,
  },
  {
    id: "blaze-mid",
    slug: "blaze-mid",
    name: "BLAZE Mid",
    tagline: "Heat on the court.",
    description:
      "A mid-cut with a flame-dipped sole and a reinforced toe. Built loud, finished clean.",
    price: 18600,
    compareAt: null,
    categoryId: "sneakers",
    badge: "NEW",
    colors: ["Flame", "White"],
    sizes: ["8", "9", "10", "11", "12"],
    images: [img("1542291026-7eec264c27ff".replace("1542291026-7eec264c27ff", "1600185365483-26d7a4cc7519"))],
    featured: true,
    stock: 12,
  },
  {
    id: "shadow-high",
    slug: "shadow-high",
    name: "SHADOW High",
    tagline: "Classic silhouette, night palette.",
    description:
      "High-top leather with contrast overlays and a cushioned insole. A staple that still turns heads.",
    price: 21000,
    compareAt: 24000,
    categoryId: "sneakers",
    badge: "LIMITED",
    colors: ["Black/Red", "White"],
    sizes: ["7", "8", "9", "10", "11"],
    images: [img("1552346154-21d32810aba3")],
    featured: false,
    stock: 9,
  },
  {
    id: "pastel-low",
    slug: "pastel-low",
    name: "PASTEL Low",
    tagline: "Soft color, hard sole.",
    description:
      "A low-profile runner in washed pastels with a chunky platform. Summer uniform.",
    price: 15600,
    compareAt: null,
    categoryId: "sneakers",
    badge: null,
    colors: ["Pastel", "Cream"],
    sizes: ["6", "7", "8", "9", "10"],
    images: [img("1595950653106-6c9ebd614d3a")],
    featured: false,
    stock: 15,
  },
  {
    id: "mono-court",
    slug: "mono-court",
    name: "MONO Court",
    tagline: "All white. No noise.",
    description:
      "Minimal leather court sneaker with perforated detailing. The cleanest thing in the drop.",
    price: 12800,
    compareAt: null,
    categoryId: "sneakers",
    badge: null,
    colors: ["White"],
    sizes: ["7", "8", "9", "10", "11", "12"],
    images: [img("1608231387042-66d1773070a5")],
    featured: false,
    stock: 30,
  },
  {
    id: "retro-track",
    slug: "retro-track",
    name: "RETRO Track",
    tagline: "90s runner, rebuilt.",
    description:
      "Chunky track silhouette with mixed panels and a sculpted midsole. Weekend only.",
    price: 17400,
    compareAt: null,
    categoryId: "sneakers",
    badge: "NEW",
    colors: ["Multi", "Grey"],
    sizes: ["8", "9", "10", "11"],
    images: [img("1560769629-975ec94e6a86")],
    featured: false,
    stock: 11,
  },
  {
    id: "skate-vulc",
    slug: "skate-vulc",
    name: "SKATE Vulc",
    tagline: "Grip, then go.",
    description:
      "Vulcanized skate shoe in suede with a waffle outsole. Board-ready, street-approved.",
    price: 9800,
    compareAt: 12000,
    categoryId: "sneakers",
    badge: null,
    colors: ["Burgundy", "Black"],
    sizes: ["7", "8", "9", "10", "11"],
    images: [img("1525966222134-fcfa99b8ae77")],
    featured: false,
    stock: 22,
  },
  {
    id: "neon-knit",
    slug: "neon-knit",
    name: "NEON Knit",
    tagline: "Seen from a block away.",
    description:
      "High-vis knit runner with a rocker sole. For the people who don't blend in.",
    price: 16200,
    compareAt: null,
    categoryId: "sneakers",
    badge: "DROP",
    colors: ["Neon", "Black"],
    sizes: ["7", "8", "9", "10", "11", "12"],
    images: [img("1606107557195-0e29a4b5b4aa")],
    featured: true,
    stock: 14,
  },
  {
    id: "signal-lock",
    slug: "signal-lock",
    name: "SIGNAL Lock Bag",
    tagline: "Structured. Loud red.",
    description:
      "A boxy top-handle in smooth leather with a signature clasp. Day-to-night without the switch.",
    price: 24800,
    compareAt: null,
    categoryId: "bags",
    badge: "NEW",
    colors: ["Signal Red", "Black"],
    sizes: ["One Size"],
    images: [img("1584917865442-de89df76afd3")],
    featured: true,
    stock: 8,
  },
  {
    id: "chevron-camera",
    slug: "chevron-camera",
    name: "CHEVRON Camera",
    tagline: "Quilted, chained, done.",
    description:
      "Compact camera bag with chevron quilting and a detachable chain strap.",
    price: 19600,
    compareAt: 22000,
    categoryId: "bags",
    badge: null,
    colors: ["Black", "Cream"],
    sizes: ["One Size"],
    images: [img("1548036328-c9fa89d128fa")],
    featured: false,
    stock: 16,
  },
  {
    id: "daypack",
    slug: "daypack",
    name: "DAY Pack",
    tagline: "One compartment. Everything.",
    description:
      "Matte nylon daypack with a padded laptop sleeve and hidden pocket. Commute armor.",
    price: 11800,
    compareAt: null,
    categoryId: "bags",
    badge: null,
    colors: ["Ink", "Olive"],
    sizes: ["One Size"],
    images: [img("1553062407-98eeb64c6a62")],
    featured: false,
    stock: 20,
  },
  {
    id: "woven-tote",
    slug: "woven-tote",
    name: "WOVEN Market",
    tagline: "Leather meets weave.",
    description:
      "Structured tote with a woven leather body and a flap closure. Weekend bag, every day.",
    price: 26800,
    compareAt: null,
    categoryId: "bags",
    badge: "LIMITED",
    colors: ["Amber"],
    sizes: ["One Size"],
    images: [img("1590874103328-eac38a683ce7")],
    featured: true,
    stock: 6,
  },
  {
    id: "chain-mini",
    slug: "chain-mini",
    name: "CHAIN Mini",
    tagline: "Small bag, full attitude.",
    description:
      "Color-block mini bag on a fine chain. Fits the phone, the keys, the night.",
    price: 8800,
    compareAt: null,
    categoryId: "bags",
    badge: null,
    colors: ["Blush", "Black"],
    sizes: ["One Size"],
    images: [img("1566150905458-1bf1fc113f0d")],
    featured: false,
    stock: 25,
  },
  {
    id: "saddle-cross",
    slug: "saddle-cross",
    name: "SADDLE Crossbody",
    tagline: "Hands free. Still dressed.",
    description:
      "Pebbled leather crossbody with a turn-lock and an adjustable strap.",
    price: 17800,
    compareAt: null,
    categoryId: "bags",
    badge: null,
    colors: ["Teal", "Black"],
    sizes: ["One Size"],
    images: [img("1594223274512-ad4803739b7c")],
    featured: false,
    stock: 13,
  },
  {
    id: "archive-backpack",
    slug: "archive-backpack",
    name: "ARCHIVE Backpack",
    tagline: "Leather, weathered on purpose.",
    description:
      "Full-grain leather backpack that looks better the longer you own it.",
    price: 29800,
    compareAt: 34000,
    categoryId: "bags",
    badge: null,
    colors: ["Cognac"],
    sizes: ["One Size"],
    images: [img("1622560480605-d83c853bc5c3")],
    featured: false,
    stock: 7,
  },
  {
    id: "bone-tee",
    slug: "bone-tee",
    name: "BONE Graphic Tee",
    tagline: "Heavyweight. One print.",
    description:
      "240gsm cotton tee with a single chest graphic. Washed, not precious.",
    price: 4800,
    compareAt: null,
    categoryId: "apparel",
    badge: "NEW",
    colors: ["Black", "White"],
    sizes: ["S", "M", "L", "XL"],
    images: [img("1503342217505-b0a15ec3261c")],
    featured: false,
    stock: 40,
  },
  {
    id: "flight-bomber",
    slug: "flight-bomber",
    name: "FLIGHT Bomber",
    tagline: "Satin shell, city lining.",
    description:
      "Classic bomber in a warm satin with rib cuffs and a clean interior.",
    price: 22800,
    compareAt: null,
    categoryId: "apparel",
    badge: null,
    colors: ["Camel", "Black"],
    sizes: ["S", "M", "L", "XL"],
    images: [img("1591047139829-d91aecb6caea")],
    featured: true,
    stock: 10,
  },
  {
    id: "heavy-hoodie",
    slug: "heavy-hoodie",
    name: "HEAVY Hoodie",
    tagline: "Fleece that holds shape.",
    description:
      "Oversized heavyweight hoodie with a double-lined hood. The off-duty layer.",
    price: 9800,
    compareAt: 12000,
    categoryId: "apparel",
    badge: null,
    colors: ["Sage", "Black", "Grey"],
    sizes: ["S", "M", "L", "XL"],
    images: [img("1556905055-8f358a7a47b2")],
    featured: false,
    stock: 28,
  },
];

// fix blaze image id cleanly
products[2].images = [img("1600185365483-26d7a4cc7519")];

async function main() {
  await prisma.invoice.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.taxRate.deleteMany();
  await prisma.shippingMethod.deleteMany();
  await prisma.currency.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.storeSettings.deleteMany();
  await prisma.discountRedemption.deleteMany();
  await prisma.discount.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.emailMessage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.rateLimitEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  for (const c of categories) {
    await prisma.category.create({ data: c });
  }
  for (const [index, p] of products.entries()) {
    const slug = p.slug;
    const colors = p.colors as string[];
    const sizes = p.sizes as string[];
    const variants = colors.flatMap((color: string) =>
      sizes.map((size: string, sizeIndex: number) => ({
        color,
        size,
        sku: `${slug.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10)}-${color
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "")
          .slice(0, 6)}-${size.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 6) || "X"}`,
        // Spread the seed stock across variants so totals stay realistic.
        stock: Math.max(1, Math.round(p.stock / (colors.length * sizes.length)) + (sizeIndex % 3)),
      })),
    );

    const zhCopy: Record<string, { name: string; tagline: string; description: string }> = {
      "volt-runner": { name: "VOLT 跑鞋 01", tagline: "织面鞋面，不含糊。", description: "全掌泡棉中底搭配透气工程织面，为城市长距离与深夜抢购而生。" },
      "court-low": { name: "COURT 低帮翻毛皮", tagline: "第一天就像穿旧了。", description: "高级翻毛皮杯底低帮鞋，加厚鞋口。找不到更合适的鞋时，就拿这双。" },
      "blaze-mid": { name: "BLAZE 中帮", tagline: "球场上的火焰。", description: "中帮设计，渐变火焰大底与加固鞋头。够响，够干净。" },
      "shadow-high": { name: "SHADOW 高帮", tagline: "经典轮廓，暗夜配色。", description: "高帮皮革鞋身，撞色拼片与缓震鞋垫。永不过时的必备款。" },
      "signal-lock": { name: "SIGNAL 锁扣手袋", tagline: "挺括结构，张扬正红。", description: "光滑皮革方形手提包，标志性锁扣。白天到夜晚无需换包。" },
      "chevron-camera": { name: "CHEVRON 相机包", tagline: "菱格、链条，一步到位。", description: "小巧相机包，菱格绗缝与可拆卸链条肩带。" },
      "daypack": { name: "DAY 双肩包", tagline: "一个隔层，装下全部。", description: "哑光尼龙双肩包，带笔记本夹层与隐藏口袋。" },
      "bone-tee": { name: "BONE 印花T恤", tagline: "重磅，一处印花。", description: "240 克纯棉T恤，单点胸口印花。水洗质感，不娇气。" },
      "flight-bomber": { name: "FLIGHT 飞行夹克", tagline: "缎面外壳，城市内衬。", description: "经典飞行夹克，暖调缎面，罗纹袖口，内里干净利落。" },
    };

    const product = await prisma.product.create({
      data: {
        ...p,
        translations: zhCopy[p.id] ? JSON.stringify({ zh: zhCopy[p.id] }) : null,
        colors: JSON.stringify(p.colors),
        sizes: JSON.stringify(p.sizes),
        images: JSON.stringify(p.images),
        position: index,
        status: "active",
        stock: 0,
        variants: { create: variants },
      },
    });

    const total = await prisma.variant.aggregate({ where: { productId: product.id }, _sum: { stock: true } });
    await prisma.product.update({ where: { id: product.id }, data: { stock: total._sum.stock ?? 0 } });
  }

  await prisma.discount.deleteMany();
  await prisma.discount.createMany({
    data: [
      { code: "WELCOME10", type: "percentage", value: 10, minSubtotal: 0 },
      { code: "DROP20", type: "percentage", value: 20, minSubtotal: 20000, usageLimit: 100 },
      { code: "SAVE15", type: "fixed", value: 1500, minSubtotal: 10000 },
      { code: "EXPIRED", type: "percentage", value: 50, endsAt: new Date(Date.now() - 86400000) },
    ],
  });
  await prisma.storeSettings.create({
    data: {
      id: "default",
      taxEnabled: true,
      taxBasis: "shipping",
      taxShipping: false,
      fallbackTaxRate: 0,
      freeShippingThreshold: 15000,
    },
  });

  await prisma.taxRate.createMany({
    data: [
      { country: "US", region: "CA", label: "CA sales tax", rate: 725 },
      { country: "US", region: "NY", label: "NY sales tax", rate: 800 },
      { country: "US", region: "TX", label: "TX sales tax", rate: 825 },
      { country: "US", label: "US sales tax", rate: 0 },
      { country: "GB", label: "UK VAT", rate: 2000 },
      { country: "DE", label: "German VAT", rate: 1900 },
      { country: "FR", label: "French VAT", rate: 2000 },
      { country: "CA", label: "Canada GST", rate: 500 },
      { country: "AU", label: "Australia GST", rate: 1000 },
      { country: "JP", label: "Japan consumption tax", rate: 1000 },
    ],
  });

  await prisma.shippingMethod.createMany({
    data: [
      { name: "Standard", description: "5–8 business days", price: 1200, freeOver: 15000, position: 0 },
      { name: "Express", description: "2–3 business days", price: 2800, freeOver: 40000, position: 1 },
      { name: "Next day", description: "Order before 2pm", price: 4500, position: 2, minSubtotal: 10000 },
    ],
  });

  await prisma.currency.createMany({
    data: [
      { code: "usd", name: "US Dollar", symbol: "$", rate: 1, decimals: 2, position: 0 },
      { code: "eur", name: "Euro", symbol: "€", rate: 0.92, decimals: 2, position: 1 },
      { code: "gbp", name: "British Pound", symbol: "£", rate: 0.79, decimals: 2, position: 2 },
      { code: "jpy", name: "Japanese Yen", symbol: "¥", rate: 151.4, decimals: 0, position: 3 },
      { code: "cny", name: "Chinese Yuan", symbol: "¥", rate: 7.24, decimals: 2, position: 4 },
      { code: "hkd", name: "Hong Kong Dollar", symbol: "HK$", rate: 7.81, decimals: 2, position: 5 },
      { code: "krw", name: "South Korean Won", symbol: "₩", rate: 1345.0, decimals: 0, position: 6 },
      { code: "sgd", name: "Singapore Dollar", symbol: "SGD", rate: 1.34, decimals: 2, position: 7 },
      { code: "aud", name: "Australian Dollar", symbol: "A$", rate: 1.52, decimals: 2, position: 8 },
      { code: "cad", name: "Canadian Dollar", symbol: "CA$", rate: 1.37, decimals: 2, position: 9 },
      { code: "chf", name: "Swiss Franc", symbol: "CHF", rate: 0.88, decimals: 2, position: 10 },
      { code: "aed", name: "United Arab Emirates Dirham", symbol: "AED", rate: 3.67, decimals: 2, position: 11 },
      { code: "inr", name: "Indian Rupee", symbol: "₹", rate: 83.2, decimals: 2, position: 12 },
      { code: "brl", name: "Brazilian Real", symbol: "R$", rate: 5.05, decimals: 2, position: 13 },
    ],
  });

  await prisma.paymentMethod.createMany({
    data: [
      { code: "card", name: "Credit / debit card", description: "Visa, Mastercard, Amex", enabled: true, automated: true, position: 0 },
      { code: "apple_pay", name: "Apple Pay", description: "One-tap on supported devices", enabled: false, automated: true, position: 1 },
      { code: "google_pay", name: "Google Pay", description: "One-tap on Android", enabled: false, automated: true, position: 2 },
      { code: "paypal", name: "PayPal", description: "Redirects to PayPal", enabled: false, automated: false, position: 3 },
      { code: "bank_transfer", name: "Bank transfer", description: "Ships after funds clear", enabled: true, automated: false, instructions: "We'll email bank details after you order. Orders ship once the transfer clears.", position: 4 },
      { code: "cod", name: "Cash on delivery", description: "Pay the courier on arrival", enabled: false, automated: false, instructions: "Have the exact amount ready for the courier.", position: 5 },
    ],
  });

  const demoAdminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@drop.test";
  // Never ship a guessable default: generate one and print it once.
  const demoAdminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");
  await prisma.adminUser.create({
    data: {
      email: demoAdminEmail,
      name: "Store Admin",
      role: "owner",
      passwordHash: await hashPassword(demoAdminPassword),
    },
  });

  console.log(`Seeded ${products.length} products`);
  console.log(`Admin: ${demoAdminEmail} / ${demoAdminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
