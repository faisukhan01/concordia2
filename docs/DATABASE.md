# Database

## Web (Prisma)

Schema in `prisma/schema.prisma`. Models: User, Role, Session, Student, Attendance, Result, Fee, Invoice, Timetable, Announcement.

## Mobile

Mobile app talks to the web API; no local DB. Auth tokens persisted via `flutter_secure_storage`.

## Migrations

`bun run db:push` applies schema to the database.
