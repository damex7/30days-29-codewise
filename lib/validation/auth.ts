import { z } from "zod";

// Form schemas (shared by server actions; types via z.infer).

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(254, "That email is too long.")
  .pipe(z.email("Enter a valid email address, like ada@example.com."));

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password.").max(200, "That password is too long."),
});

export const signUpSchema = z
  .object({
    email: emailField,
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(200, "Use at most 200 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords don't match." });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
