import { Mail, ShieldCheck, Clock } from "lucide-react";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata = {
  title: "Contact · VendGuard",
  description:
    "Get in touch with the VendGuard team — questions, demos, or help getting set up.",
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
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-6 sm:py-24">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">
            Contact
          </span>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Let&apos;s keep your trucks open.
          </h1>
          <p className="mt-6 text-pretty text-lg text-muted-foreground">
            Whether you&apos;re sizing up VendGuard for one truck or ten,
            we&apos;re happy to help. Reach out and we&apos;ll get back to you.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.1fr]">
          {/* Contact methods */}
          <div className="flex flex-col gap-6">
            {METHODS.map(({ icon: Icon, title, body, action, href }) => (
              <div
                key={title}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-6"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold">{title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                  {action &&
                    (href ? (
                      <a
                        href={href}
                        className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                      >
                        {action}
                      </a>
                    ) : (
                      <span className="mt-2 inline-block text-sm font-medium">
                        {action}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          <div>
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}
