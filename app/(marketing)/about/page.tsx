import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import Image from "next/image";
import foodtruckHero from "@/app/assets/foodtruck-2.jpg";
import foodtruckCta from "@/app/assets/foodtruck-4.jpg";


export const metadata = {
  title: "About · VendGuard",
  description:
    "Why VendGuard exists: keeping mobile food operators open by making compliance impossible to forget.",
};


const VALUES = [
  {
    title: "Operators first",
    body: "Every decision is judged by one question: does this help a truck stay open and compliant with less effort?",
  },
  {
    title: "Never lose a record",
    body: "Compliance data is sacred. We archive instead of delete, and keep an append-only history you can stand behind.",
  },
  {
    title: "Honest about limits",
    body: "We track and remind — we don't file or guarantee. We tell you clearly what's a suggestion and what's confirmed.",
  },
  {
    title: "Quietly reliable",
    body: "The best compliance tool is one you forget about, because it reminds you exactly when it matters.",
  },
];


export default function AboutPage() {
  return (
    <main>
    <section className="border-b border-border/60">
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <span className="text-sm font-semibold uppercase tracking-widest text-brand-ink">
          About
        </span>


        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-3xl">
          We understand how difficult it can be to keep track of your business compliance information.
        </h1>


        <div className="mt-6 text-pretty text-lg text-muted-foreground space-y-4">
          <p>
            A single lapsed permit or expired COI can shut a food truck down for a weekend — or a season.
          </p>


          <p className="whitespace-pre-line">
            The information isn&apos;t hard to track;
            it&apos;s just scattered across many tedious portals, from inboxes and agency portals to physical documents, each with its own renewal date.
          </p>


          <p>
            VendGuard pulls your information into one place and makes sure a deadline never sneaks up on you again.
          </p>


          <p>
            Keep track of your business information, all in one personalized dashboard.
          </p>



        </div>
      </div>
    </section>


      <section className="relative overflow-hidden border-b border-border/60">


        <Image
          src={foodtruckHero}
          alt=""
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          className="object-cover -z-10 absolute inset-0"
        />
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-12 sm:px-6 sm:py-14 z-10">
 
          <h2 className="text-4xl font-bold tracking-tight text-white">Why we built it</h2>
          <div className="mt-7 space-y-5 text-pretty text-white">
            <p>
              Mobile food is one of the most heavily regulated small businesses
              there is — health permits, fire and hood inspections,
              food-handler cards, vehicle registration, insurance certificates,
              and a commissary agreement on top. Each renews on its own clock,
              and the penalty for missing one is steep.
            </p>
            <p>
              Big-business compliance software is overkill and overpriced for a
              one-to-ten-truck operation. So operators end up with spreadsheets
              and calendar reminders that quietly fall out of date. VendGuard is
              purpose-built for that gap: simple enough to set up in an
              afternoon, and thorough enough that nothing slips through.
            </p>
            {/* <p className="text-sm italic">
              This is placeholder copy for the marketing preview — the real
              story and team details go here before launch.
            </p> */}
          </div>



       </div>
    </section>




      


      <section className="border-y border-border/60 bg-secondary/30">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 sm:py-14">
          <h2 className="text-2xl font-bold tracking-tight">
            <span className="relative inline-block pb-1 after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-brand-ink after:content-['']">
              What we value
            </span>
          </h2>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2">
            {VALUES.map((v) => (
              <div key={v.title}>
                <h3 className="text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-pretty text-muted-foreground">
                  {v.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>


      <section className="relative overflow-hidden border-t border-border/60">

        <Image
          
          src={foodtruckCta}
          alt=""
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          className="object-cover -z-10 absolute inset-0"
          
        
        
        />

        <div className="absolute inset-0 bg-foreground/80" />
        <div 
        
        // className="mx-auto w-full max-w-3xl px-5 py-14 text-center sm:px-6"
        
        
        // className="relative overflow-hidden border-b border-border/60"
        
        className="relative mx-auto max-w-3xl px-5 py-16 text-center sm:px-6 sm:py-20"
        
        >
          <h2 className="mx-auto max-w-2xl text-balance text-2xl font-bold tracking-tight text-background sm:text-3xl">
            We believe all food-service professionals should have the tools to
            keep their compliance information organized and accessible.
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Start free trial
            </Link>
            <Link
              href="/contact"
             
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}