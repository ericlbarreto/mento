import { z } from "zod";

export const GradeLevel = z.enum(["7º ano", "8º ano", "9º ano"]);
export type GradeLevel = z.infer<typeof GradeLevel>;

export const Guardian = z.object({
  name: z.string(),
  relationship: z.string(),
  phone: z.string(),
  email: z.string(),
});

/** Fictional personal data (mock). Never sent to an LLM (BR-14). */
export const StudentProfile = z.object({
  birth_date: z.string(),
  enrollment_code: z.string(),
  class_name: z.string(),
  grade_level: GradeLevel,
  guardian: Guardian,
});
export type StudentProfile = z.infer<typeof StudentProfile>;

export const SubjectResult = z.object({
  subject: z.string(),
  final_grade: z.number(),
  attendance_pct: z.number(),
  status: z.enum(["aprovado", "recuperação", "reprovado"]),
});

export const SchoolYear = z.object({
  year: z.number().int(),
  grade_level: z.string(),
  school_name: z.string(),
  subjects: z.array(SubjectResult),
});
export type SchoolYear = z.infer<typeof SchoolYear>;

export const TermGrade = z.object({
  term: z.string(),
  subject: z.string(),
  grade: z.number(),
  absences: z.number().int(),
});
export type TermGrade = z.infer<typeof TermGrade>;

export const StudentInput = z.object({
  fixture_id: z.string().optional(),
  name: z.string().min(1),
  is_simulated: z.boolean().default(false),
  profile: StudentProfile.optional(),
  school_history: z.array(SchoolYear).default([]),
  current_term: z.array(TermGrade).default([]),
});
export type StudentInput = z.input<typeof StudentInput>;

export const Student = StudentInput.extend({
  id: z.string(),
  is_simulated: z.boolean(),
  school_history: z.array(SchoolYear),
  current_term: z.array(TermGrade),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Student = z.infer<typeof Student>;

export const CreateStudentBody = z.object({
  name: z.string().trim().min(1),
  profile: StudentProfile.optional(),
});
export type CreateStudentBody = z.infer<typeof CreateStudentBody>;
