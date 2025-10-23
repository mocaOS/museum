import { type VariantProps, cva } from "class-variance-authority";

export { default as Button } from "./Button.vue";

export const buttonVariants = cva(
  `
    inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm
    font-medium whitespace-nowrap transition-all outline-none
    focus-visible:border-ring focus-visible:ring-[3px]
    focus-visible:ring-ring/50
    disabled:pointer-events-none disabled:opacity-50
    aria-invalid:border-destructive aria-invalid:ring-destructive/20
    dark:aria-invalid:ring-destructive/40
    [&_svg]:pointer-events-none [&_svg]:shrink-0
    [&_svg:not([class*=\'size-\'])]:size-4
  `,
  {
    variants: {
      variant: {
        default:
          `
            border border-primary bg-primary text-primary-foreground shadow-xs
            hover:border-primary/90 hover:bg-primary/90
          `,
        destructive:
          `
            border border-destructive bg-destructive text-white shadow-xs
            hover:border-destructive/90 hover:bg-destructive/90
            focus-visible:ring-destructive/20
            dark:border-destructive/60 dark:bg-destructive/60
            dark:hover:border-destructive/90
            dark:focus-visible:ring-destructive/40
          `,
        outline:
          `
            border bg-background shadow-xs
            hover:bg-accent hover:text-accent-foreground
            dark:bg-input/30 dark:hover:bg-input/50
          `,
        secondary:
          `
            border border-secondary bg-secondary text-secondary-foreground
            shadow-xs
            hover:border-secondary/80 hover:bg-secondary/80
          `,
        ghost:
          `
            border border-transparent
            hover:bg-accent hover:text-accent-foreground
            dark:hover:bg-accent/50
          `,
        link: `
          text-primary underline-offset-4
          hover:underline
        `,
      },
      size: {
        default: `
          h-9 px-4 py-2
          has-[>svg]:px-3
        `,
        sm: `
          h-8 gap-1.5 rounded-md px-3
          has-[>svg]:px-2.5
        `,
        lg: `
          h-10 rounded-md px-6
          has-[>svg]:px-4
        `,
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
