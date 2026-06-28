import Image from "next/image";
import { Mail, ShieldCheck, Clock } from "lucide-react";
import { ContactForm } from "@/components/marketing/contact-form";
import foodtruckHeader from "@/app/assets/foodtruck-1.jpg";

export const metadata = {
  title: "Contact · CartLedger",
  description:
    "Get in touch with the CartLedger team — questions, demos, or help getting set up.",
};

const METHODS = [
  {
    icon: Mail,
    title: "General & support",
    body: "Questions, demos, or help getting set up.",
    action: "raysarchive@proton.me",
    href: "mailto:raysarchive@proton.me",
  },
  {
    icon: ShieldCheck,
    title: "Privacy & legal",
    body: "Data requests, deletion, and policy questions.",
    action: "raysarchive@proton.me",
    href: "mailto:raysarchive@proton.me",
  },
  {
    icon: Clock,
    title: "Response time",
    body: "We aim to reply within one business day.",
    action: null,
    href: null,
  },
];

export default function ContactPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border/60">
        <Image
          src={foodtruckHeader}
          alt=""
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-foreground/70" />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand">
            Contact
          </span>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight text-background sm:text-5xl">
            Let&apos;s keep your trucks open.
          </h1>
          <p className="mt-6 text-pretty text-lg text-background/85">
            Whether you&apos;re sizing up CartLedger for one truck or ten,
            we&apos;re happy to help. Reach out and we&apos;ll get back to you.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-6 sm:py-14">
          {/* Three contact "bubbles" in a row */}
          <div className="grid gap-4 sm:grid-cols-3">
            {METHODS.map(({ icon: Icon, title, body, action, href }) => (
              <div
                key={title}
                className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
              >
                <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-secondary text-brand-ink">
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-4 font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                {action &&
                  (href ? (
                    <a
                      href={href}
                      className="mt-2 inline-block text-sm font-medium text-brand-ink hover:underline"
                    >
                      {action}
                    </a>
                  ) : (
                    <span className="mt-2 inline-block text-sm font-medium">
                      {action}
                    </span>
                  ))}
              </div>
            ))}
          </div>

          {/* Form stacked below, in a centered column */}
          <div className="mx-auto mt-8 max-w-2xl">
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}
