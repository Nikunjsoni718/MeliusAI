import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function MeliusPlusPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-slate-800/80 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:p-8">
        <Badge variant="creative">Melius+</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Subscription support for people who want a deeper, longer runway.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-400">
          Melius+ turns the core product into a sustained coaching and verification layer with customized roadmaps, unlimited audits, and a founder offer designed to lower the barrier early.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_0.92fr]">
          <Card className="border-fuchsia-500/15">
            <CardHeader>
              <Badge variant="creative" className="w-fit">First Year Free</Badge>
              <CardTitle className="text-3xl">Founder&apos;s Offer</CardTitle>
              <CardDescription className="text-base leading-7">
                Early users get the first year of Melius+ at no cost while the product is still being shaped with the generation it is built for.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button href="/auth">Join through the auth gate</Button>
              <Button variant="outline" href="/about-us">Read the vision</Button>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {[
              {
                title: 'Customized Roadmap',
                description: 'Roadmaps adapt to profession, target company, and verified weaknesses instead of showing generic learning tracks.',
              },
              {
                title: 'Unlimited Audits',
                description: 'Users can re-scan and refine their proof repeatedly as they ship, learn, and close hiring gaps.',
              },
              {
                title: 'Long-horizon support',
                description: 'Melius+ is positioned as a career operating layer, not a one-off score reveal.',
              },
            ].map((item) => (
              <Card key={item.title}>
                <CardContent className="p-6">
                  <p className="text-lg font-semibold text-white">{item.title}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

