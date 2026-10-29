import fs from "node:fs";
import path from "node:path";
import type { PlaceResult } from "./places";
import type { Lead } from "./types";

/**
 * One click: lead -> live website.
 *
 * Builds a complete `SalonConfig` for the sibling `salon-template` project from
 * the lead's real data — name, contact, address, Instagram, Google rating,
 * opening hours and reviews — filled out with the house Turkish/English copy.
 * Every media path points into `public/salons/<slug>/`, which starts empty:
 * the template's default pool renders designed placeholders until real photos
 * are dropped in, so the site is presentable the second it is generated and
 * only improves from there.
 *
 * The generated file is plain TypeScript typed as `SalonConfig`, so anything
 * this module gets wrong fails the template's typecheck instead of silently
 * shipping — and it is safe to polish by hand afterwards.
 */

/* ------------------------------------------------------------------ locale */

type Loc = string | { tr: string; en?: string };

const TR_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

/** Words that pad salon names without identifying them. */
const GENERIC_TAIL = new Set([
  "kuafor", "kuafforu", "kuaforu", "salon", "salonu", "saloon", "hair", "beauty",
  "guzellik", "studio", "studyo", "erkek", "bayan", "unisex", "coiffeur", "berber",
]);

export function slugify(name: string): string {
  const ascii = name
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const words = ascii.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);

  // Trim generic tail words ("X Hair Salon" -> "x") but never trim to nothing.
  while (words.length > 1 && GENERIC_TAIL.has(words[words.length - 1])) words.pop();

  const slug = words.join("-").slice(0, 40).replace(/^-+|-+$/g, "");
  return slug || "salon";
}

/** "zhanna-nails" -> "zhannaNails", for the import identifier in the registry. */
function identFor(slug: string): string {
  const ident = slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return /^[a-z_$]/i.test(ident) ? ident : `salon${ident}`;
}

function upperTr(s: string): string {
  return s.toLocaleUpperCase("tr-TR");
}

/* ------------------------------------------------------------------- phone */

/** "0532 111 22 33" / "+90 532..." -> "905321112233", or null when unusable. */
function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `9${digits}`;
  if (digits.length === 10) digits = `90${digits}`;
  if (!digits.startsWith("90") || digits.length !== 12) return null;
  // Only Turkish mobiles (5xx) can receive WhatsApp; a landline link would 404.
  return digits[2] === "5" ? digits : null;
}

/* ------------------------------------------------------------------- hours */

const DAY_NAMES: { tr: string; en: string }[] = [
  { tr: "Pazartesi", en: "Monday" },
  { tr: "Salı", en: "Tuesday" },
  { tr: "Çarşamba", en: "Wednesday" },
  { tr: "Perşembe", en: "Thursday" },
  { tr: "Cuma", en: "Friday" },
  { tr: "Cumartesi", en: "Saturday" },
  { tr: "Pazar", en: "Sunday" },
];

type HourRow = { day: Loc; open: string | null; close: string | null };

const DEFAULT_HOURS: HourRow[] = DAY_NAMES.map((day, i) => ({
  day,
  open: i === 6 ? null : "10:00",
  close: i === 6 ? null : "20:00",
}));

function hhmm(hour?: number, minute?: number): string {
  return `${String(hour ?? 0).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`;
}

/**
 * Google periods (day 0 = Sunday, possibly split shifts) -> the template's
 * Monday-first single-range week. Split shifts collapse to first open / last
 * close — the template shows one range per day.
 */
function mapHours(place: PlaceResult | null): { hours: HourRow[]; real: boolean } {
  const periods = place?.regularOpeningHours?.periods;
  if (!periods?.length) return { hours: DEFAULT_HOURS, real: false };

  // A 24/7 place comes back as one open period with no close.
  if (periods.length === 1 && periods[0].open && !periods[0].close) {
    return {
      hours: DAY_NAMES.map((day) => ({ day, open: "00:00", close: "23:59" })),
      real: true,
    };
  }

  const byDay = new Map<number, { open: string; close: string }>();
  for (const p of periods) {
    if (p.open?.day === undefined) continue;
    const mondayFirst = (p.open.day + 6) % 7;
    const open = hhmm(p.open.hour, p.open.minute);
    const close = p.close ? hhmm(p.close.hour, p.close.minute) : "23:59";
    const cur = byDay.get(mondayFirst);
    byDay.set(mondayFirst, {
      open: cur && cur.open < open ? cur.open : open,
      close: cur && cur.close > close ? cur.close : close,
    });
  }

  return {
    hours: DAY_NAMES.map((day, i) => {
      const range = byDay.get(i);
      return range ? { day, open: range.open, close: range.close } : { day, open: null, close: null };
    }),
    real: true,
  };
}

/* ----------------------------------------------------------------- reviews */

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function reviewDate(iso?: string): Loc | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return {
    tr: `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    en: `${EN_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
  };
}

type ReviewItem = { quote: string; name: string; rating?: number; date?: Loc; avatar?: string };

/** Real Google reviews, best first: rated 4+, with text, capped at six. */
function mapReviews(place: PlaceResult | null): ReviewItem[] {
  const reviews = place?.reviews ?? [];
  return reviews
    .map((r) => ({
      quote: (r.originalText?.text ?? r.text?.text ?? "").trim(),
      name: r.authorAttribution?.displayName?.trim() || "Google kullanıcısı",
      rating: r.rating,
      date: reviewDate(r.publishTime),
      avatar: r.authorAttribution?.photoUri || undefined,
    }))
    .filter((r) => r.quote.length >= 20 && (r.rating ?? 0) >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.quote.length - a.quote.length)
    .slice(0, 6);
}

/* -------------------------------------------------------------- the config */

export type GeneratedSite = {
  slug: string;
  config: Record<string, unknown>;
  /** What came from real data vs. house defaults — surfaced in the UI toast. */
  notes: string[];
};

export function buildSalonConfig(
  lead: Lead,
  place: PlaceResult | null,
  opts: { name?: string } = {},
): GeneratedSite {
  /**
   * Google Maps names carry their own keyword stuffing — "Maksem Kuaför Women
   * & Men Beauty Saloon" is a listing title, not a brand. The operator gets to
   * type the real one at generation time; the Google name is the fallback.
   */
  const businessName = opts.name?.trim() || lead.name;

  const slug = slugify(businessName);
  const M = `/salons/${slug}`;
  const notes: string[] = [];

  const area = lead.district ?? lead.city;
  // Plain uppercase, not Turkish-locale: brand names are usually Latin-styled
  // ("Studio" must not become "STUDİO"). A Turkish name that needs its İ back
  // is a one-character edit in the generated file.
  const displayName = businessName.toUpperCase();
  const suffix = lead.category ? upperTr(lead.category) : "GÜZELLİK SALONU";

  const whatsapp = whatsappNumber(lead.phone);
  if (lead.phone && !whatsapp) notes.push("Phone is not a Turkish mobile — booking falls back to calls; set `whatsapp` by hand if they have one.");
  if (!lead.phone) notes.push("Lead has no phone number — add `contact.phone` before sending the site.");

  const { hours, real: realHours } = mapHours(place);
  if (!realHours) notes.push("Google had no opening hours — the config uses Mon–Sat 10:00–20:00; adjust if needed.");

  const reviews = mapReviews(place);
  const rating = place?.rating ?? lead.rating;
  const reviewCount = place?.userRatingCount ?? lead.reviewCount;
  if (!reviews.length) notes.push("No usable Google reviews came back — the reviews rail stays hidden until items are added.");

  const instagram = lead.instagramUsername
    ? { username: lead.instagramUsername, url: lead.instagramUrl ?? `https://instagram.com/${lead.instagramUsername}` }
    : null;
  if (!instagram) notes.push("No Instagram on the lead — the Instagram section is omitted.");

  const mapEmbed =
    lead.lat != null && lead.lng != null
      ? `https://www.google.com/maps?q=${lead.lat},${lead.lng}&z=16&output=embed`
      : lead.address
        ? `https://www.google.com/maps?q=${encodeURIComponent(lead.address)}&output=embed`
        : undefined;

  const config: Record<string, unknown> = {
    slug,

    brand: {
      name: displayName,
      suffix,
      monogram: displayName.charAt(0),
    },

    locales: ["tr", "en"],

    theme: {
      bg: "#FBF8F3",
      bgAlt: "#F3EDE3",
      surface: "#FFFFFF",
      ink: "#1E1A16",
      inkSoft: "#7A6E62",
      accent: "#A9813F",
      accentDeep: "#83621F",
      accentInk: "#FFFFFF",
      line: "#E3D9C9",
      dark: "#141110",
      darkInk: "#EFE7DA",
      fonts: { display: "playfair", body: "jost" },
      radius: "16px",
    },

    seo: {
      title: {
        tr: `${businessName} — ${area} Kuaför & Güzellik Salonu`,
        en: `${businessName} — Hair & Beauty in ${area}`,
      },
      description: {
        tr: `${businessName}: ${area} bölgesinde saç, güzellik ve bakım. Online randevu, şeffaf fiyat listesi ve uzman ekip.`,
        en: `${businessName}: hair and beauty in ${area}, ${lead.city}. Online booking, transparent prices and an expert team.`,
      },
      keywords: [
        "kuaför",
        "güzellik salonu",
        area.toLocaleLowerCase("tr-TR"),
        lead.city.toLocaleLowerCase("tr-TR"),
        businessName.toLocaleLowerCase("tr-TR"),
      ],
      ogImage: `${M}/og.jpg`,
    },

    contact: {
      phone: lead.phone ?? "+90 000 000 00 00",
      ...(lead.phone ? { phoneDisplay: lead.phone } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      ...(lead.email ? { email: lead.email } : {}),
      address: lead.address ?? `${area}, ${lead.city}`,
      city: lead.city,
      ...(mapEmbed ? { mapEmbed } : {}),
      ...(lead.mapsUrl ? { mapLink: lead.mapsUrl } : {}),
      ...(instagram ? { social: { instagram: instagram.url } } : {}),
      hours,
    },

    hero: {
      eyebrow: { tr: "Güzelliğiniz, bizim sanatımız.", en: "Your beauty, our craft." },
      titleTop: { tr: "Zarafetini", en: "Reveal Your" },
      titleAccent: { tr: "Ortaya Çıkar", en: "Elegance" },
      description: {
        tr: "Uzman ekibimizle, size özel tasarlanmış güzellik deneyimi ve kusursuz sonuçlar.",
        en: "An expert team, a beauty experience designed around you, and results without compromise.",
      },
      image: `${M}/hero.jpg`,
      imageAlt: { tr: `${businessName} salonundan bir kare`, en: `Inside ${businessName}` },
      ...(rating
        ? {
            rating: {
              score: `${rating.toFixed(1)}/5`,
              label: {
                tr: `Google'da ${reviewCount ?? "birçok"} yorum`,
                en: `${reviewCount ?? "Many"} Google reviews`,
              },
              ...(reviews.some((r) => r.avatar)
                ? { avatars: reviews.filter((r) => r.avatar).slice(0, 4).map((r) => r.avatar!) }
                : {}),
            },
          }
        : {}),
    },

    experience: {
      eyebrow: { tr: "Salon Ritüeli", en: "The Salon Ritual" },
      title: { tr: "Bir randevudan fazlası.", en: "More than an appointment." },
      titleAccent: { tr: "Size özel bir ritüel.", en: "A ritual made for you." },
      note: {
        tr: "Her randevu sizi anlamakla başlar ve tamamen size ait bir görünümle biter.",
        en: "Every appointment begins with understanding and ends with a look that feels unmistakably yours.",
      },
      image: `${M}/experience.jpg`,
      imageAlt: { tr: `${businessName} salon deneyimi`, en: `The ${businessName} experience` },
    },

    services: {
      eyebrow: { tr: "Hizmetlerimiz", en: "Our Services" },
      title: { tr: "Size Özel Deneyimler", en: "Experiences Made for You" },
      description: {
        tr: "Her hizmet, saçınızın yapısına ve yaşam tarzınıza göre yeniden tasarlanır.",
        en: "Every service is rebuilt around your hair type and the way you live.",
      },
      items: [
        {
          id: "sac-kesimi",
          name: { tr: "Saç Kesimi", en: "Haircut" },
          description: {
            tr: "Yüz hatlarınıza ve saç dokunuza göre tasarlanan, uzarken bile formunu koruyan kesimler.",
            en: "Cuts designed around your face and hair texture — shapes that hold as they grow out.",
          },
          image: `${M}/services/sac-kesimi.jpg`,
          video: "/defaults/haircut.mp4",
          price: "1.200",
          duration: "45",
        },
        {
          id: "sac-boyama",
          name: { tr: "Saç Boyama", en: "Hair Colour" },
          description: {
            tr: "Ton analizi ile belirlenen, ışığı doğru yakalayan kalıcı renkler.",
            en: "Lasting colour chosen by tone analysis, built to catch the light correctly.",
          },
          image: `${M}/services/sac-boyama.jpg`,
          video: "/defaults/hair-color.mp4",
          price: "2.400",
          duration: "120",
        },
        {
          id: "tirnak",
          name: { tr: "Tırnak Bakımı", en: "Nails" },
          description: {
            tr: "Manikür, kalıcı oje ve nail art — saçınız hazırlanırken tırnaklarınız da hazır olsun.",
            en: "Manicure, gel polish and nail art — finished while your hair is.",
          },
          image: `${M}/services/tirnak.jpg`,
          video: "/defaults/nail.mp4",
          price: "800",
          duration: "60",
        },
        {
          id: "makyaj",
          name: { tr: "Makyaj", en: "Makeup" },
          description: {
            tr: "Davet ve gelin makyajı; gün boyu kalıcı, fotoğrafta kusursuz.",
            en: "Event and bridal makeup — camera-ready and built to last the day.",
          },
          image: `${M}/services/makyaj.jpg`,
          video: "/defaults/makeup.mp4",
          price: "1.500",
          duration: "60",
        },
      ],
    },

    about: {
      eyebrow: { tr: "Hakkımızda", en: "About Us" },
      title: { tr: "Tutkumuz, Güzelliğiniz", en: "Our Passion, Your Beauty" },
      body: [
        {
          tr: `${businessName} olarak, güzelliğin sadece bir görünüm değil, kişiliğinizi yansıtan bir sanat olduğuna inanıyoruz. Modern teknikler ve sanatsal dokunuşlarla, en iyi versiyonunuzu ortaya çıkarıyoruz.`,
          en: `At ${businessName} we believe beauty is not just a look but an art that reflects who you are. With modern technique and an artistic hand, we bring out your best version.`,
        },
        {
          tr: `Salonumuz ${area} bölgesinde, her müşterimizi bir proje gibi ele alıyor: saç yapısı, yaşam ritmi ve bakım alışkanlıkları. Sonuç, salondan çıktıktan haftalar sonra bile taşıyabildiğiniz bir görünüm.`,
          en: `In ${area}, ${lead.city}, we treat every client as a project — hair structure, daily rhythm, care habits. The result is a look you can still carry weeks after you leave the chair.`,
        },
      ],
      images: [`${M}/about-1.jpg`, `${M}/about-2.jpg`],
      sealText: { tr: "EL İŞÇİLİĞİ • KİŞİYE ÖZEL • ", en: "HANDCRAFTED • BESPOKE • " },
      stats: [],
    },

    gallery: {
      eyebrow: { tr: "Galeri", en: "Gallery" },
      title: { tr: "Ellerimizden Çıkanlar", en: "Work From Our Chairs" },
      images: [],
    },

    pricing: {
      eyebrow: { tr: "Fiyatlar", en: "Pricing" },
      title: { tr: "Şeffaf Fiyat Listesi", en: "Transparent Price List" },
      note: {
        tr: "Fiyatlar saç uzunluğu ve yoğunluğuna göre değişiklik gösterebilir. Kesin fiyat için ücretsiz ön görüşme yapıyoruz.",
        en: "Prices vary with hair length and density. We offer a free consultation before every colour service.",
      },
      currency: "₺",
      groups: [
        {
          id: "kesim",
          name: { tr: "Kesim & Şekillendirme", en: "Cut & Styling" },
          items: [
            { name: { tr: "Kadın Saç Kesimi", en: "Women's Haircut" }, price: "1.200", duration: "45" },
            { name: { tr: "Erkek Saç Kesimi", en: "Men's Haircut" }, price: "650", duration: "30" },
            { name: { tr: "Fön & Şekillendirme", en: "Blow-dry & Styling" }, price: "700", duration: "40" },
            {
              name: { tr: "Topuz / Gelin Saçı", en: "Updo / Bridal Hair" },
              description: { tr: "Prova dahil", en: "Trial included" },
              price: "1.800",
              duration: "60",
              featured: true,
            },
          ],
        },
        {
          id: "renk",
          name: { tr: "Renk", en: "Colour" },
          items: [
            { name: { tr: "Tek Renk Boya", en: "Single-Process Colour" }, price: "2.400", duration: "120" },
            { name: { tr: "Balayage", en: "Balayage" }, price: "3.200", duration: "180", featured: true },
            { name: { tr: "Röfle", en: "Highlights" }, price: "2.800", duration: "150" },
            { name: { tr: "Dip Boya", en: "Root Touch-up" }, price: "1.400", duration: "75" },
          ],
        },
        {
          id: "bakim",
          name: { tr: "Bakım & Güzellik", en: "Care & Beauty" },
          items: [
            { name: { tr: "Keratin Bakım", en: "Keratin Treatment" }, price: "3.500", duration: "150" },
            { name: { tr: "Manikür & Kalıcı Oje", en: "Manicure & Gel Polish" }, price: "800", duration: "60" },
            { name: { tr: "Profesyonel Makyaj", en: "Professional Makeup" }, price: "1.500", duration: "60", featured: true },
            { name: { tr: "Yoğun Nem Bakımı", en: "Deep Moisture Ritual" }, price: "1.100", duration: "45" },
          ],
        },
      ],
    },

    ...(rating
      ? {
          testimonials: {
            eyebrow: { tr: "Yorumlar", en: "Reviews" },
            title: { tr: "Yorumlar", en: "Reviews" },
            source: {
              name: "Google",
              score: rating.toFixed(1),
              ...(reviewCount ? { count: reviewCount } : {}),
              ...(lead.mapsUrl ? { url: lead.mapsUrl } : {}),
            },
            items: reviews.map((r) => ({
              quote: r.quote,
              name: r.name,
              ...(r.rating ? { rating: r.rating } : {}),
              ...(r.date ? { date: r.date } : {}),
              ...(r.avatar ? { avatar: r.avatar } : {}),
            })),
          },
        }
      : {}),

    ...(instagram
      ? {
          instagram: {
            eyebrow: { tr: "Instagram", en: "Instagram" },
            title: { tr: "Kamera Arkası, Her Gün", en: "Behind the Chair, Every Day" },
            description: {
              tr: "Dönüşümler, kamera arkası ve sonuçlar — hepsi Instagram'da. Takip edin, sıradaki dönüşüm sizinki olsun.",
              en: "Transformations, behind-the-scenes and finished looks — all on Instagram. Follow along; the next transformation could be yours.",
            },
            handle: `@${instagram.username}`,
            url: instagram.url,
            videos: [1, 2, 3, 4].map((n) => ({
              src: `${M}/reels/${n}.mp4`,
              caption: { tr: `Instagram ${n}`, en: `Instagram ${n}` },
            })),
          },
        }
      : {}),

    cta: {
      eyebrow: { tr: "Randevu", en: "Appointments" },
      title: { tr: "Sıradaki koltuk sizin.", en: "The next chair is yours." },
      description: {
        tr: "Ücretsiz ön görüşme ile başlayalım. Ne istediğinizi birlikte netleştirelim, sonrasını biz halledelim.",
        en: "Let us start with a free consultation. We will define what you want together and take care of the rest.",
      },
      image: `${M}/cta.jpg`,
    },
  };

  return { slug, config, notes };
}

/* ------------------------------------------------------------ TS rendering */

const IDENT_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Pretty-prints a config object as TypeScript source (unquoted keys). */
function tsLiteral(value: unknown, indent: string): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const items = value.map((v) => `${inner}${tsLiteral(v, inner)},`).join("\n");
    return `[\n${items}\n${indent}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (!entries.length) return "{}";
    const body = entries
      .map(([k, v]) => `${inner}${IDENT_KEY.test(k) ? k : JSON.stringify(k)}: ${tsLiteral(v, inner)},`)
      .join("\n");
    return `{\n${body}\n${indent}}`;
  }
  throw new Error(`Cannot serialize ${typeof value}`);
}

export function renderConfigFile(site: GeneratedSite, lead: Lead): string {
  const ident = identFor(site.slug);
  return `import type { SalonConfig } from "@/lib/types";

/**
 * Generated by Lead-Tracker on ${new Date().toISOString().slice(0, 10)} for "${lead.name}".
 * lead:${lead.id}
 *
 * Safe to edit by hand — but regenerating from Lead-Tracker overwrites this
 * file, so move hand-made changes you want to keep out of the way first.
 */
const ${ident}: SalonConfig = ${tsLiteral(site.config, "")};

export default ${ident};
`;
}

/* -------------------------------------------------------------- filesystem */

export function templateDir(): string {
  const marker = path.join("src", "salons", "index.ts");

  const candidates: string[] = [];
  if (process.env.SALON_TEMPLATE_DIR) {
    candidates.push(path.resolve(process.env.SALON_TEMPLATE_DIR));
  } else {
    // The template sits beside this project, but a built server can run from a
    // directory that is nowhere near it — walk up from the cwd looking for it.
    for (let dir = process.cwd(); ; ) {
      candidates.push(path.join(dir, "salon-template"));
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }

  const dir = candidates.find((c) => fs.existsSync(path.join(c, marker)));
  if (!dir) {
    throw new Error(
      `salon-template not found — set SALON_TEMPLATE_DIR to its path. Tried: ${candidates.join(", ")}`,
    );
  }
  return dir;
}

/** The marker comment ties a generated file to its lead, for safe overwrites. */
function fileBelongsToLead(configPath: string, leadId: string): boolean {
  try {
    return fs.readFileSync(configPath, "utf8").includes(`lead:${leadId}`);
  } catch {
    return false;
  }
}

/**
 * A slug this lead can own: the natural one when free or already theirs,
 * otherwise suffixed with the area, then numbered. Hand-written configs
 * (panfili, ayna) carry no lead marker and are never overwritten.
 */
export function claimSlug(dir: string, base: string, lead: Lead): string {
  const salonsDir = path.join(dir, "src", "salons");
  const areaSuffix = slugify(lead.district ?? lead.city);
  const candidates = [base, `${base}-${areaSuffix}`, ...[2, 3, 4, 5].map((n) => `${base}-${n}`)];

  for (const slug of candidates) {
    if (slug === "index") continue;
    const file = path.join(salonsDir, `${slug}.ts`);
    if (!fs.existsSync(file) || fileBelongsToLead(file, lead.id)) return slug;
  }
  throw new Error(`Could not find a free slug for "${base}" — clean up old test configs.`);
}

const MEDIA_README = (slug: string) => `# Media for /${slug}

Drop files here — every missing file shows a designed house default, so upload
only what you have. Filenames must match exactly:

Priority (per-salon media that sells the site):
- experience.jpg   — the "ritual" section portrait (square-ish)
- about-1.jpg      — about section, main photo (4:5)
- about-2.jpg      — about section, second photo (3:4)
- reels/1.mp4 …4.mp4 — Instagram reels (9:16, ~1080x1920, muted, <4MB each)

Usually left on defaults:
- hero.jpg         — hero background
- cta.jpg          — closing band background
- og.jpg           — social share image (1200x630)
- services/sac-kesimi.jpg, sac-boyama.jpg, tirnak.jpg, makyaj.jpg
`;

export type WriteResult = { slug: string; configPath: string; mediaDir: string };

/** Writes the config, registers it, and scaffolds the media folder. */
export function writeSite(site: GeneratedSite, lead: Lead): WriteResult {
  const dir = templateDir();
  const previous = findSlugIn(dir, lead.id);
  const slug = claimSlug(dir, site.slug, lead);

  // The slug may have been suffixed to stay unique — patch it through the config.
  if (slug !== site.slug) {
    const patched = JSON.parse(
      JSON.stringify(site.config).split(`/salons/${site.slug}/`).join(`/salons/${slug}/`),
    );
    patched.slug = slug;
    site = { ...site, slug, config: patched };
  }

  const configPath = path.join(dir, "src", "salons", `${slug}.ts`);
  const mediaDir = path.join(dir, "public", "salons", slug);

  // A renamed business gets a new slug. The old site is this lead's own, so it
  // is retired rather than left orphaned in the registry — and any media
  // already uploaded moves across, since it is theirs too.
  if (previous && previous !== slug) {
    const oldMedia = path.join(dir, "public", "salons", previous);
    if (fs.existsSync(oldMedia) && !fs.existsSync(mediaDir)) {
      fs.mkdirSync(path.dirname(mediaDir), { recursive: true });
      fs.renameSync(oldMedia, mediaDir);
    }
    fs.rmSync(path.join(dir, "src", "salons", `${previous}.ts`), { force: true });
    fs.rmSync(oldMedia, { recursive: true, force: true });
    unregisterSalon(dir, previous);
  }

  fs.writeFileSync(configPath, renderConfigFile(site, lead), "utf8");

  registerSalon(dir, slug);

  fs.mkdirSync(path.join(mediaDir, "services"), { recursive: true });
  fs.mkdirSync(path.join(mediaDir, "reels"), { recursive: true });
  fs.writeFileSync(path.join(mediaDir, "_MEDIA.md"), MEDIA_README(slug), "utf8");

  return { slug, configPath, mediaDir };
}

/* ------------------------------------------------------------- site media */

/**
 * The image slots a generated site exposes, in the order they matter for
 * selling: the sections usually customized first at the top. `file` is the
 * path inside `public/salons/<slug>/` that the generated config points at.
 */
export const MEDIA_SLOTS = [
  { id: "experience", label: "Ritual section (experience)", file: "experience.jpg" },
  { id: "about-1", label: "About — main photo", file: "about-1.jpg" },
  { id: "about-2", label: "About — second photo", file: "about-2.jpg" },
  { id: "hero", label: "Hero background", file: "hero.jpg" },
  { id: "cta", label: "Closing band (CTA)", file: "cta.jpg" },
  { id: "og", label: "Social share image", file: "og.jpg" },
  { id: "service-sac-kesimi", label: "Service — Haircut", file: "services/sac-kesimi.jpg" },
  { id: "service-sac-boyama", label: "Service — Hair colour", file: "services/sac-boyama.jpg" },
  { id: "service-tirnak", label: "Service — Nails", file: "services/tirnak.jpg" },
  { id: "service-makyaj", label: "Service — Makeup", file: "services/makyaj.jpg" },
] as const;

/** The Instagram-section clips: filled from a pasted reel link or direct .mp4. */
export const VIDEO_SLOTS = [
  { id: "reel-1", label: "Instagram reel 1", file: "reels/1.mp4" },
  { id: "reel-2", label: "Instagram reel 2", file: "reels/2.mp4" },
  { id: "reel-3", label: "Instagram reel 3", file: "reels/3.mp4" },
  { id: "reel-4", label: "Instagram reel 4", file: "reels/4.mp4" },
] as const;

export const ALL_SLOTS = [...MEDIA_SLOTS, ...VIDEO_SLOTS] as const;

export type MediaSlotId = (typeof ALL_SLOTS)[number]["id"];

export function isVideoSlot(id: MediaSlotId): boolean {
  return id.startsWith("reel-");
}

/**
 * The slug of the site this lead owns, found by the `lead:<id>` marker in the
 * generated config files — survives a hand-edited demo URL.
 */
export function findLeadSlug(leadId: string): string | null {
  return findSlugIn(templateDir(), leadId);
}

function findSlugIn(dir: string, leadId: string): string | null {
  const salonsDir = path.join(dir, "src", "salons");
  for (const file of fs.readdirSync(salonsDir)) {
    if (!file.endsWith(".ts") || file === "index.ts") continue;
    if (fs.readFileSync(path.join(salonsDir, file), "utf8").includes(`lead:${leadId}`)) {
      return file.slice(0, -3);
    }
  }
  return null;
}

export type MediaSlotStatus = { id: MediaSlotId; label: string; file: string; exists: boolean };

/** Which slots already have a real file, for the panel's "uploaded" markers. */
export function mediaStatus(slug: string): MediaSlotStatus[] {
  const mediaDir = path.join(templateDir(), "public", "salons", slug);
  return ALL_SLOTS.map((slot) => ({
    ...slot,
    exists: fs.existsSync(path.join(mediaDir, slot.file)),
  }));
}

/**
 * Google's photo CDN encodes the size in a `=w400-h300`-style suffix; asking
 * for `=s1600` returns the same photo at gallery resolution. Other hosts are
 * fetched exactly as pasted.
 */
export function upsizeGooglePhotoUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!url.hostname.endsWith("googleusercontent.com")) return raw;
    return `${raw.replace(/=[^=/]*$/, "")}=s1600`;
  } catch {
    return raw;
  }
}

/**
 * Drops Next's optimized-image cache in the template project.
 *
 * Every `next/image` variant is cached by URL, and replacing a slot's photo
 * keeps the URL identical — so without this the site keeps serving the old
 * picture until the cache entry expires, which reads as "the upload did not
 * work". The cache is disposable: the next request re-optimizes.
 *
 * Every `.next*` directory is cleared because the template can be running out
 * of any of them (dev, the preview server, a verification build).
 */
export function clearImageCache(): void {
  const dir = templateDir();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(".next")) continue;
    try {
      fs.rmSync(path.join(dir, entry.name, "cache", "images"), {
        recursive: true,
        force: true,
      });
    } catch {
      /* a locked entry is not worth failing an upload over */
    }
  }
}

/** Where a slot's file lives on disk for one salon. */
export function mediaFilePath(slug: string, slotId: MediaSlotId): string {
  const slot = ALL_SLOTS.find((s) => s.id === slotId);
  if (!slot) throw new Error(`Unknown media slot: ${slotId}`);
  return path.join(templateDir(), "public", "salons", slug, slot.file);
}

/* ---------------------------------------------------------------- registry */

/** Removes a retired salon's import and registry entry. */
function unregisterSalon(dir: string, slug: string) {
  const registryPath = path.join(dir, "src", "salons", "index.ts");
  let src = fs.readFileSync(registryPath, "utf8");
  const ident = identFor(slug);

  src = src.replace(new RegExp(`^import ${ident} from "\\./${slug}";\\r?\\n`, "m"), "");

  const listRe = /export const salons: SalonConfig\[\] = \[([^\]]*)\];/;
  const list = src.match(listRe);
  if (list) {
    const entries = list[1]
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e && e !== ident);
    src = src.replace(listRe, `export const salons: SalonConfig[] = [${entries.join(", ")}];`);
  }

  fs.writeFileSync(registryPath, src, "utf8");
}

/** Adds the import and the registry entry to `src/salons/index.ts`, once. */
function registerSalon(dir: string, slug: string) {
  const registryPath = path.join(dir, "src", "salons", "index.ts");
  let src = fs.readFileSync(registryPath, "utf8");
  if (src.includes(`from "./${slug}"`)) return;

  const ident = identFor(slug);

  const importLines = [...src.matchAll(/^import .+ from "\.\/.+";$/gm)];
  const lastImport = importLines[importLines.length - 1];
  if (!lastImport) throw new Error("Registry has no salon imports to append after.");
  const at = (lastImport.index ?? 0) + lastImport[0].length;
  src = `${src.slice(0, at)}\nimport ${ident} from "./${slug}";${src.slice(at)}`;

  const listRe = /export const salons: SalonConfig\[\] = \[([^\]]*)\];/;
  const list = src.match(listRe);
  if (!list) throw new Error("Could not find the salons registry array in index.ts.");
  const entries = list[1].trim().replace(/,\s*$/, "");
  src = src.replace(listRe, `export const salons: SalonConfig[] = [${entries}, ${ident}];`);

  fs.writeFileSync(registryPath, src, "utf8");
}
