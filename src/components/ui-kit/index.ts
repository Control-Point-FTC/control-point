// Control Point UI kit: shadcn/ui components (MIT) adapted to our design tokens.
//
// Token mapping (shadcn name -> ours). Don't paste shadcn source without
// translating these, because the names collide:
//   bg-background            -> bg-primary (page)
//   bg-card / bg-popover     -> bg-elevated (or .card-surface)
//   bg-muted                 -> bg-secondary / bg-text-base/[0.06]
//   bg-primary text-primary-foreground -> bg-accent text-accent-ink
//   bg-accent (hover fill)   -> bg-text-base/[0.06..0.08]
//   text-foreground          -> text-text-base
//   text-muted-foreground    -> text-text-muted
//   border-border / -input   -> border-line
//   ring-ring                -> ring-accent/60
export * from './button';
export * from './basic';
export * from './overlay';
export * from './tabs';
