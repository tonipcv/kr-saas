# PatientProfile: Per-doctor (tenant) patient data

This document explains the new logic for managing patient data scoped to each doctor, avoiding conflicts with the global `User` identity.

## Models overview

- `User` (global identity)
  - Single record per email. Fields like `email`, `role`, and global identifiers.
  - May contain general medical fields, but these are now treated as global defaults only.

- `DoctorPatientRelationship` (link/permission)
  - Connects `doctorId` ↔ `patientId`.
  - Controls access and status via `isActive`, `isPrimary`.

- `PatientProfile` (per-doctor patient fields)
  - Unique per `(doctorId, userId)`.
  - Holds tenant-scoped fields: `name`, `phone`, `address`, `emergency_contact`, `emergency_phone`, `medical_history`, `allergies`, `medications`, `notes`, `isActive`.
  - These fields override the `User` values when viewing data inside that doctor's workspace.

Schema references in `prisma/schema.prisma`:
- `model DoctorPatientRelationship` lines ~907–929
- `model User` lines ~1035–1124 (back-relations `doctor_profiles`/`patient_profiles`)
- `model PatientProfile` lines ~1126–1152

## API behavior

### List patients (GET `/api/patients`)
- Auth as doctor.
- Loads patients via `DoctorPatientRelationship` for the doctor.
- Includes `patient_profiles` filtered by `doctorId` and prefers its fields over `User` when present.
- Response preserves the existing shape used in the UI, with a fallback to `User` values if no profile exists.

### Create/link patient (POST `/api/patients`)
- Auth as doctor.
- If `email` exists:
  - Ensures there is an active `DoctorPatientRelationship`.
  - Upserts a `PatientProfile` for `(doctorId, userId)` with provided fields.
  - Returns the per-doctor data (name/phone/etc. from the request, email from `User`).
- If `email` does not exist:
  - Creates a new `User` with role `PATIENT` and the provided global fields.
  - Creates the `DoctorPatientRelationship`.
  - Creates a `PatientProfile` for the doctor with the provided fields.

### Get patient detail (GET `/api/patients/[id]`)
- Auth as doctor and must have an active `DoctorPatientRelationship`.
- Returns patient data preferring `PatientProfile` fields, falling back to `User`.

### Update patient (PUT `/api/patients/[id]`)
- Auth as doctor and must have an active relationship.
- Upserts `PatientProfile` for tenant fields: `name`, `phone`, `address`, `emergency_contact`, `emergency_phone`, `medical_history`, `allergies`, `medications`, `notes`.
- Updates a limited set of global fields on `User` when present: `email`, `birth_date`, `gender`.
- Returns a compact response with the updated values.

### Delete patient (DELETE `/api/patients/[id]`)
- Auth as doctor and must have an active relationship.
- Soft-deletes the `User` (`is_active = false`).
- Marks the `DoctorPatientRelationship` as inactive.
- Marks the `PatientProfile` as inactive for that doctor.

## Why this design
- Prevents the patient's display name and other fields from unintentionally changing when the email belongs to an existing `User` (including the doctor themself).
- Supports per-doctor customization of patient records without duplicating the global identity.
- Keeps compatibility with existing UI response shapes while enabling tenancy.

## Edge cases and notes
- If a patient exists with the same email linked to another doctor, this design creates a new `PatientProfile` for the new doctor without affecting the other doctor.
- Global `User` fields (e.g., `email`) remain a single source of truth and can still be updated when appropriate.
- UI should prefer the API output (which already prefers `PatientProfile`), so no UI changes should be required.

## Future improvements
- Validation to block linking if the existing email belongs to a `DOCTOR`/`ADMIN` (policy dependent).
- Audit logging of profile changes per doctor.
- Bulk import that creates `PatientProfile` records directly.
