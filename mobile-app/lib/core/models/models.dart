// Concordia College — Data models.
// Mirrors the SQLite/Turso schema in the web app's src/lib/server/db.ts.

import 'dart:convert';

/// A user record. Covers all 8 roles: super-admin, admin, admissions,
/// accountant, academic, teacher, student, parent.
class User {
  final String id;
  final String name;
  final String? email;
  final String? rollNo;
  final String role;
  final String status;
  final String? title;
  final int mustChangePassword;
  final int blocked;
  final String? blockedReason;
  final String? instituteId;
  final String? branchId;
  final String? className;
  final String? section;
  final String? guardian;
  final String? ward;
  final String? wardId;
  final String? fatherName;
  final String? cnic;
  final String? dob;
  final String? address;
  final String? prevResult;
  final String? program;
  final String? photoUrl;
  final String? guardianPhone;
  final double? baseFee;
  final int baseFeeLocked;
  final String? instituteName;
  final String? branchName;
  final String? createdAt;

  User({
    required this.id,
    required this.name,
    this.email,
    this.rollNo,
    required this.role,
    this.status = 'Active',
    this.title,
    this.mustChangePassword = 0,
    this.blocked = 0,
    this.blockedReason,
    this.instituteId,
    this.branchId,
    this.className,
    this.section,
    this.guardian,
    this.ward,
    this.wardId,
    this.fatherName,
    this.cnic,
    this.dob,
    this.address,
    this.prevResult,
    this.program,
    this.photoUrl,
    this.guardianPhone,
    this.baseFee,
    this.baseFeeLocked = 0,
    this.instituteName,
    this.branchName,
    this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'] ?? '',
        name: j['name'] ?? '',
        email: j['email'],
        rollNo: j['rollNo'],
        role: j['role'] ?? 'student',
        status: j['status'] ?? 'Active',
        title: j['title'],
        mustChangePassword: j['mustChangePassword'] is int
            ? j['mustChangePassword']
            : int.tryParse('${j['mustChangePassword'] ?? 0}') ?? 0,
        blocked: j['blocked'] is int
            ? j['blocked']
            : int.tryParse('${j['blocked'] ?? 0}') ?? 0,
        blockedReason: j['blockedReason'],
        instituteId: j['instituteId'],
        branchId: j['branchId'],
        className: j['class'] ?? j['className'],
        section: j['section'],
        guardian: j['guardian'],
        ward: j['ward'],
        wardId: j['wardId'],
        fatherName: j['fatherName'],
        cnic: j['cnic'],
        dob: j['dob'],
        address: j['address'],
        prevResult: j['prevResult'],
        program: j['program'],
        photoUrl: j['photoUrl'],
        guardianPhone: j['guardianPhone'],
        baseFee: (j['baseFee'] is num) ? (j['baseFee'] as num).toDouble() : null,
        baseFeeLocked: j['baseFeeLocked'] is int
            ? j['baseFeeLocked']
            : int.tryParse('${j['baseFeeLocked'] ?? 0}') ?? 0,
        instituteName: j['instituteName'],
        branchName: j['branchName'],
        createdAt: j['createdAt'],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'rollNo': rollNo,
        'role': role,
        'status': status,
        'title': title,
        'mustChangePassword': mustChangePassword,
        'blocked': blocked,
        'blockedReason': blockedReason,
        'instituteId': instituteId,
        'branchId': branchId,
        'class': className,
        'section': section,
        'guardian': guardian,
        'ward': ward,
        'wardId': wardId,
        'fatherName': fatherName,
        'cnic': cnic,
        'dob': dob,
        'address': address,
        'prevResult': prevResult,
        'program': program,
        'photoUrl': photoUrl,
        'guardianPhone': guardianPhone,
        'baseFee': baseFee,
        'baseFeeLocked': baseFeeLocked,
        'instituteName': instituteName,
        'branchName': branchName,
        'createdAt': createdAt,
      };

  bool get isActive => status == 'Active' && blocked == 0;
  bool get isStudent => role == 'student';
  bool get isTeacher => role == 'teacher';
  bool get isParent => role == 'parent';
  bool get isSuperAdmin => role == 'super-admin';
  bool get isAdmin => role == 'admin';
  bool get isAccountant => role == 'accountant';
  bool get isAdmissions => role == 'admissions';
  bool get isAcademic => role == 'academic';

  String get displayId => rollNo ?? email ?? id;
  String get roleLabel => const {
        'super-admin': 'Super Admin',
        'admin': 'Admin',
        'admissions': 'Admission Office',
        'accountant': 'Accountant',
        'academic': 'Academic Office',
        'teacher': 'Teacher',
        'student': 'Student',
        'parent': 'Parent / Guardian',
      }[role] ??
      'User';
}

/// Login response: { token, user, mustChangePassword }
class AuthSession {
  final String token;
  final User user;
  final bool mustChangePassword;

  AuthSession({
    required this.token,
    required this.user,
    this.mustChangePassword = false,
  });

  factory AuthSession.fromJson(Map<String, dynamic> j) => AuthSession(
        token: j['token'] ?? '',
        user: User.fromJson(j['user'] ?? {}),
        mustChangePassword: j['mustChangePassword'] == true ||
            j['mustChangePassword'] == 1 ||
            j['mustChangePassword'] == '1',
      );
}

/// A class (e.g. "Class 9", section "A").
class SchoolClass {
  final String id;
  final String branchId;
  final String name;
  final String section;
  final String? teacherId;
  final String? teacherName;
  final int? studentCount;

  SchoolClass({
    required this.id,
    required this.branchId,
    required this.name,
    this.section = 'A',
    this.teacherId,
    this.teacherName,
    this.studentCount,
  });

  factory SchoolClass.fromJson(Map<String, dynamic> j) => SchoolClass(
        id: j['id'] ?? '',
        branchId: j['branchId'] ?? '',
        name: j['name'] ?? '',
        section: j['section'] ?? 'A',
        teacherId: j['teacherId'],
        teacherName: j['teacherName'],
        studentCount: j['studentCount'] is int
            ? j['studentCount']
            : int.tryParse('${j['studentCount'] ?? 0}'),
      );
}

class Course {
  final String id;
  final String branchId;
  final String name;
  final String? code;

  Course({
    required this.id,
    required this.branchId,
    required this.name,
    this.code,
  });

  factory Course.fromJson(Map<String, dynamic> j) => Course(
        id: j['id'] ?? '',
        branchId: j['branchId'] ?? '',
        name: j['name'] ?? '',
        code: j['code'],
      );
}

class FeeInvoice {
  final String id;
  final String studentId;
  final String studentName;
  final String className;
  final String branchId;
  final String instituteId;
  final int month;
  final int year;
  final double amount;
  final String type;
  final String status;
  final String? paidDate;
  final double? paidAmount;
  final String? paymentMethod;
  final String? challanNo;
  final String? dueDate;
  final String? createdAt;

  FeeInvoice({
    required this.id,
    required this.studentId,
    required this.studentName,
    required this.className,
    required this.branchId,
    required this.instituteId,
    required this.month,
    required this.year,
    required this.amount,
    this.type = 'Tuition',
    this.status = 'Unpaid',
    this.paidDate,
    this.paidAmount,
    this.paymentMethod,
    this.challanNo,
    this.dueDate,
    this.createdAt,
  });

  factory FeeInvoice.fromJson(Map<String, dynamic> j) => FeeInvoice(
        id: j['id'] ?? '',
        studentId: j['studentId'] ?? '',
        studentName: j['studentName'] ?? '',
        className: j['className'] ?? '',
        branchId: j['branchId'] ?? '',
        instituteId: j['instituteId'] ?? '',
        month: j['month'] is int ? j['month'] : int.tryParse('${j['month'] ?? 0}') ?? 0,
        year: j['year'] is int ? j['year'] : int.tryParse('${j['year'] ?? 0}') ?? 0,
        amount: (j['amount'] is num) ? (j['amount'] as num).toDouble() : 0.0,
        type: j['type'] ?? 'Tuition',
        status: j['status'] ?? 'Unpaid',
        paidDate: j['paidDate'],
        paidAmount: (j['paidAmount'] is num) ? (j['paidAmount'] as num).toDouble() : null,
        paymentMethod: j['paymentMethod'],
        challanNo: j['challanNo'],
        dueDate: j['dueDate'],
        createdAt: j['createdAt'],
      );

  bool get isPaid => status == 'Paid';
  String get monthYear => '$month / $year';
}

class Announcement {
  final String id;
  final String senderId;
  final String senderRole;
  final String title;
  final String message;
  final String targetRole;
  final String targetScope;
  final String? branchId;
  final String? classId;
  final String? createdAt;
  final String? senderName;

  Announcement({
    required this.id,
    required this.senderId,
    required this.senderRole,
    required this.title,
    required this.message,
    this.targetRole = 'all',
    this.targetScope = 'all',
    this.branchId,
    this.classId,
    this.createdAt,
    this.senderName,
  });

  factory Announcement.fromJson(Map<String, dynamic> j) => Announcement(
        id: j['id'] ?? '',
        senderId: j['senderId'] ?? '',
        senderRole: j['senderRole'] ?? '',
        title: j['title'] ?? '',
        message: j['message'] ?? '',
        targetRole: j['targetRole'] ?? 'all',
        targetScope: j['targetScope'] ?? 'all',
        branchId: j['branchId'],
        classId: j['classId'],
        createdAt: j['createdAt'],
        senderName: j['senderName'],
      );
}

class AttendanceRecord {
  final String id;
  final String branchId;
  final String classId;
  final String date;
  final String? teacherId;
  final Map<String, String> records; // studentId -> 'present'|'absent'|'late'

  AttendanceRecord({
    required this.id,
    required this.branchId,
    required this.classId,
    required this.date,
    this.teacherId,
    this.records = const {},
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> j) => AttendanceRecord(
        id: j['id'] ?? '',
        branchId: j['branchId'] ?? '',
        classId: j['classId'] ?? '',
        date: j['date'] ?? '',
        teacherId: j['teacherId'],
        records: j['records'] is String
            ? Map<String, String>.from(jsonDecode(j['records']))
            : Map<String, String>.from(j['records'] ?? {}),
      );
}

class ExamResult {
  final String id;
  final String branchId;
  final String exam;
  final String courseId;
  final String classId;
  final String? teacherId;
  final int totalMarks;
  final String date;
  final Map<String, int> records; // studentId -> marks

  ExamResult({
    required this.id,
    required this.branchId,
    required this.exam,
    required this.courseId,
    required this.classId,
    this.teacherId,
    this.totalMarks = 100,
    required this.date,
    this.records = const {},
  });

  factory ExamResult.fromJson(Map<String, dynamic> j) => ExamResult(
        id: j['id'] ?? '',
        branchId: j['branchId'] ?? '',
        exam: j['exam'] ?? '',
        courseId: j['courseId'] ?? '',
        classId: j['classId'] ?? '',
        teacherId: j['teacherId'],
        totalMarks: j['totalMarks'] is int
            ? j['totalMarks']
            : int.tryParse('${j['totalMarks'] ?? 100}') ?? 100,
        date: j['date'] ?? '',
        records: j['records'] is String
            ? Map<String, int>.from(jsonDecode(j['records']))
            : Map<String, int>.from(j['records'] ?? {}),
      );
}

class Exam {
  final String id;
  final String branchId;
  final String name;
  final String type;

  Exam({
    required this.id,
    required this.branchId,
    required this.name,
    this.type = 'Monthly Test',
  });

  factory Exam.fromJson(Map<String, dynamic> j) => Exam(
        id: j['id'] ?? '',
        branchId: j['branchId'] ?? '',
        name: j['name'] ?? '',
        type: j['type'] ?? 'Monthly Test',
      );
}

class ReportCard {
  final String id;
  final String studentId;
  final String studentName;
  final String className;
  final String section;
  final String term;
  final String examName;
  final int totalMarks;
  final int obtainedMarks;
  final double percentage;
  final String grade;
  final String? remarks;

  ReportCard({
    required this.id,
    required this.studentId,
    required this.studentName,
    required this.className,
    required this.section,
    required this.term,
    required this.examName,
    required this.totalMarks,
    required this.obtainedMarks,
    required this.percentage,
    required this.grade,
    this.remarks,
  });

  factory ReportCard.fromJson(Map<String, dynamic> j) => ReportCard(
        id: j['id'] ?? '',
        studentId: j['studentId'] ?? '',
        studentName: j['studentName'] ?? '',
        className: j['class'] ?? j['className'] ?? '',
        section: j['section'] ?? 'A',
        term: j['term'] ?? '',
        examName: j['examName'] ?? '',
        totalMarks: j['totalMarks'] is int
            ? j['totalMarks']
            : int.tryParse('${j['totalMarks'] ?? 0}') ?? 0,
        obtainedMarks: j['obtainedMarks'] is int
            ? j['obtainedMarks']
            : int.tryParse('${j['obtainedMarks'] ?? 0}') ?? 0,
        percentage: (j['percentage'] is num)
            ? (j['percentage'] as num).toDouble()
            : double.tryParse('${j['percentage'] ?? 0}') ?? 0,
        grade: j['grade'] ?? '',
        remarks: j['remarks'],
      );
}

class TimetableEntry {
  final String id;
  final String classId;
  final String className;
  final String section;
  final String day;
  final int period;
  final String startTime;
  final String endTime;
  final String subject;
  final String? teacherId;
  final String? teacherName;
  final String? roomName;

  TimetableEntry({
    required this.id,
    required this.classId,
    required this.className,
    required this.section,
    required this.day,
    required this.period,
    required this.startTime,
    required this.endTime,
    required this.subject,
    this.teacherId,
    this.teacherName,
    this.roomName,
  });

  factory TimetableEntry.fromJson(Map<String, dynamic> j) => TimetableEntry(
        id: j['id'] ?? '',
        classId: j['classId'] ?? '',
        className: j['className'] ?? '',
        section: j['section'] ?? 'A',
        day: j['day'] ?? 'Monday',
        period: j['period'] is int ? j['period'] : int.tryParse('${j['period'] ?? 1}') ?? 1,
        startTime: j['startTime'] ?? '',
        endTime: j['endTime'] ?? '',
        subject: j['subject'] ?? '',
        teacherId: j['teacherId'],
        teacherName: j['teacherName'],
        roomName: j['roomName'],
      );
}

class MiscCharge {
  final String id;
  final String studentId;
  final String studentName;
  final String branchId;
  final String type;
  final double amount;
  final String? description;
  final String? createdAt;

  MiscCharge({
    required this.id,
    required this.studentId,
    required this.studentName,
    required this.branchId,
    required this.type,
    required this.amount,
    this.description,
    this.createdAt,
  });

  factory MiscCharge.fromJson(Map<String, dynamic> j) => MiscCharge(
        id: j['id'] ?? '',
        studentId: j['studentId'] ?? '',
        studentName: j['studentName'] ?? '',
        branchId: j['branchId'] ?? '',
        type: j['type'] ?? 'custom',
        amount: (j['amount'] is num) ? (j['amount'] as num).toDouble() : 0.0,
        description: j['description'],
        createdAt: j['createdAt'],
      );
}

/// Generic stats payload returned by /api/scoped/stats etc.
class DashboardStats {
  final int totalStudents;
  final int totalTeachers;
  final int totalClasses;
  final double totalRevenue;
  final double pendingFees;
  final double collectedThisMonth;
  final int attendanceRate;
  final int activeAnnouncements;

  DashboardStats({
    this.totalStudents = 0,
    this.totalTeachers = 0,
    this.totalClasses = 0,
    this.totalRevenue = 0,
    this.pendingFees = 0,
    this.collectedThisMonth = 0,
    this.attendanceRate = 0,
    this.activeAnnouncements = 0,
  });

  factory DashboardStats.fromJson(Map<String, dynamic> j) => DashboardStats(
        totalStudents: j['totalStudents'] is int ? j['totalStudents'] : int.tryParse('${j['totalStudents'] ?? 0}') ?? 0,
        totalTeachers: j['totalTeachers'] is int ? j['totalTeachers'] : int.tryParse('${j['totalTeachers'] ?? 0}') ?? 0,
        totalClasses: j['totalClasses'] is int ? j['totalClasses'] : int.tryParse('${j['totalClasses'] ?? 0}') ?? 0,
        totalRevenue: (j['totalRevenue'] is num) ? (j['totalRevenue'] as num).toDouble() : 0.0,
        pendingFees: (j['pendingFees'] is num) ? (j['pendingFees'] as num).toDouble() : 0.0,
        collectedThisMonth: (j['collectedThisMonth'] is num) ? (j['collectedThisMonth'] as num).toDouble() : 0.0,
        attendanceRate: j['attendanceRate'] is int ? j['attendanceRate'] : int.tryParse('${j['attendanceRate'] ?? 0}') ?? 0,
        activeAnnouncements: j['activeAnnouncements'] is int ? j['activeAnnouncements'] : int.tryParse('${j['activeAnnouncements'] ?? 0}') ?? 0,
      );
}
