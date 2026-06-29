import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import Image from "next/image";
import foodtruckHero from "@/app/assets/foodtruck-2.jpg";
import foodtruckCta from "@/app/assets/foodtruck-4.jpg";


export const metadata = {
  title: "About · CartLedger",
  description:
    "Why CartLedger exists: making the money and the paperwork automatic for food trucks, so operators can run by the numbers instead of by spreadsheet.",
};


const VALUES = [
  {
    title: "Operators first",
    body: "Every decision is judged by one question: does this help a truck run with less effort — and stay open and profitable?",
  },
  {
    title: "Never lose a record",
    body: "Your books and compliance records are sacred. We archive instead of delete, and keep an append-only history you can stand behind.",
  },
  {
    title: "Honest about the numbers",
    body: "We track, total, and remind — we don't file or guarantee. We're clear about what's an estimate, what's actual, and what's confirmed.",
  },
  {
    title: "On top of your tools",
    body: "We build on Square and QuickBooks rather than replacing them — the brain on top, never another POS or cash register.",
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
          Running a food truck means tracking a hundred little things — the money and the paperwork.
        </h1>


        <div className="mt-6 text-pretty text-lg text-muted-foreground space-y-4">
          <p>
            How much did you actually make this week? What&apos;s your food cost? What&apos;s running low? And which permit renews next? It&apos;s all there — just scattered across Square, spreadsheets, inboxes, and the glove box.
          </p>


          <p>
            CartLedger pulls it together automatically. Your Square sales become income, expenses, inventory, and profit — and a running checklist surfaces what needs you next, from reorders to renewals.
          </p>


          <p>
            One personalized dashboard for the numbers and the compliance, so nothing sneaks up on you again.
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
              A food truck runs on thin margins and a stack of obligations —
              tracking sales and food cost to actually turn a profit, reordering
              before you run out, and staying on top of health permits,
              inspections, COIs, and a commissary agreement that each renew on
              their own clock.
            </p>
            <p>
              The accounting and inventory tools built for big restaurants are
              overkill and overpriced for a one-to-ten-truck operation, so
              operators end up stitching it together with spreadsheets and
              calendar reminders that quietly fall out of date. CartLedger is
              purpose-built for that gap: it sits on top of Square and
              QuickBooks, automates the tracking, and tells you what needs you
              next — simple enough to set up in an afternoon.
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
            We believe every food-service operator should be able to run their
            business — the money and the paperwork — without living in
            spreadsheets.
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