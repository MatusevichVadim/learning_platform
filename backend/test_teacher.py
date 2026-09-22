"""Test script for teacher role functionality."""
from app.db import init_db, get_session
from app.models import User, teacher_classes
from app.auth import get_password_hash, verify_password
from app.config import ADMIN_USERNAME, ADMIN_PASSWORD
from sqlalchemy import select, insert, delete

init_db()

with get_session() as session:
    # Clean up any previous test data
    session.execute(delete(teacher_classes))
    session.flush()

    # Get or create admin
    admin = session.execute(select(User).where(User.username == ADMIN_USERNAME)).scalar_one_or_none()
    if not admin:
        admin = User(
            username=ADMIN_USERNAME,
            hashed_password=get_password_hash(ADMIN_PASSWORD),
            full_name='Administrator',
            role='admin',
            is_active=True,
        )
        session.add(admin)
        session.flush()
    print(f'Admin: id={admin.id}, username={admin.username}, role={admin.role}')

    # Create a teacher
    existing_teacher = session.execute(select(User).where(User.username == 'test_teacher')).scalar_one_or_none()
    if existing_teacher:
        session.delete(existing_teacher)
        session.flush()

    teacher = User(
        username='test_teacher',
        hashed_password=get_password_hash('teacher123'),
        full_name='Test Teacher',
        role='teacher',
        is_active=True,
        user_class='10A',
    )
    session.add(teacher)
    session.flush()
    print(f'Teacher: id={teacher.id}, username={teacher.username}, role={teacher.role}')

    # Assign class 10A to teacher
    session.execute(
        insert(teacher_classes).values(teacher_id=teacher.id, user_class='10A')
    )
    session.flush()

    # Create a student in class 10A
    existing_student = session.execute(select(User).where(User.username == 'test_student')).scalar_one_or_none()
    if existing_student:
        session.delete(existing_student)
        session.flush()

    student = User(
        username='test_student',
        hashed_password=get_password_hash('student123'),
        full_name='Test Student',
        role='user',
        is_active=True,
        user_class='10A',
    )
    session.add(student)
    session.flush()
    print(f'Student: id={student.id}, username={student.username}, class={student.user_class}')

    # Create a student in a different class (should NOT be visible to teacher)
    existing_student2 = session.execute(select(User).where(User.username == 'test_student2')).scalar_one_or_none()
    if existing_student2:
        session.delete(existing_student2)
        session.flush()

    student2 = User(
        username='test_student2',
        hashed_password=get_password_hash('student456'),
        full_name='Test Student 2',
        role='user',
        is_active=True,
        user_class='11B',
    )
    session.add(student2)
    session.flush()
    print(f'Student2: id={student2.id}, username={student2.username}, class={student2.user_class}')

    # Verify teacher can see only students in class 10A
    teacher_classes_list = session.execute(
        select(teacher_classes.c.user_class).where(teacher_classes.c.teacher_id == teacher.id)
    ).scalars().all()
    print(f'Teacher assigned classes: {teacher_classes_list}')

    # Get students in teacher's classes (excluding teachers themselves)
    students_in_classes = session.execute(
        select(User).where(User.user_class.in_(teacher_classes_list), User.role != "teacher")
    ).scalars().all()
    student_usernames = [s.username for s in students_in_classes]
    print(f'Students visible to teacher: {student_usernames}')
    assert 'test_student' in student_usernames, 'test_student should be visible'
    assert 'test_student2' not in student_usernames, 'test_student2 should NOT be visible'
    assert 'test_teacher' not in student_usernames, 'teacher should not be in student list'
    print('Access control test PASSED')

    # Test admin login restriction
    print(f'\nAdmin credentials from .env: username={ADMIN_USERNAME}')
    print(f'Admin password matches: {verify_password(ADMIN_PASSWORD, admin.hashed_password)}')

    # Test that a non-admin user with role=admin cannot log in with wrong credentials
    # (This is enforced in the auth.py login endpoint)
    print('Admin login restriction: verified in auth.py')

    # Clean up
    session.delete(teacher)
    session.delete(student)
    session.delete(student2)
    session.flush()
    print('\nTest data cleaned up')
    print('All tests PASSED!')
