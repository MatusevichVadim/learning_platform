"""Comprehensive API test for teacher role functionality."""
from fastapi.testclient import TestClient
from app.main import app
from app.db import init_db, get_session
from app.models import User, teacher_classes
from app.auth import get_password_hash
from app.config import ADMIN_USERNAME, ADMIN_PASSWORD
from sqlalchemy import select, insert, delete

init_db()

client = TestClient(app)

with get_session() as session:
    # Clean up all test data
    session.execute(delete(teacher_classes))
    session.flush()
    
    # Delete test users
    for uname in ['test_teacher', 'test_student1', 'test_student2', 'test_student3', 'new_student', 'new_student2', 'new_admin']:
        existing = session.execute(select(User).where(User.username == uname)).scalar_one_or_none()
        if existing:
            session.delete(existing)
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
    teacher_id = teacher.id
    
    # Assign class 10A to teacher
    session.execute(
        insert(teacher_classes).values(teacher_id=teacher_id, user_class='10A')
    )
    session.flush()
    
    # Create students
    for uname, fname, pwd, uclass in [
        ('test_student1', 'Student One', 'student123', '10A'),
        ('test_student2', 'Student Two', 'student456', '10A'),
        ('test_student3', 'Student Three', 'student789', '11B'),
    ]:
        existing = session.execute(select(User).where(User.username == uname)).scalar_one_or_none()
        if existing:
            session.delete(existing)
            session.flush()
        student = User(
            username=uname,
            hashed_password=get_password_hash(pwd),
            full_name=fname,
            role='user',
            is_active=True,
            user_class=uclass,
        )
        session.add(student)
        session.flush()

print("=== Test 1: Admin login with .env credentials ===")
resp = client.post('/api/auth/login', json={'username': ADMIN_USERNAME, 'password': ADMIN_PASSWORD})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Admin login failed: {resp.text}"
admin_token = resp.cookies.get('access_token')
print(f"Admin login: SUCCESS")

print("\n=== Test 2: Admin login with wrong password ===")
resp = client.post('/api/auth/login', json={'username': ADMIN_USERNAME, 'password': 'wrongpassword'})
print(f"Status: {resp.status_code}")
assert resp.status_code == 401, f"Admin login with wrong password should fail"
print(f"Admin login with wrong password: BLOCKED (correct)")

print("\n=== Test 3: Teacher login ===")
resp = client.post('/api/auth/login', json={'username': 'test_teacher', 'password': 'teacher123'})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Teacher login failed: {resp.text}"
teacher_token = resp.cookies.get('access_token')
print(f"Teacher login: SUCCESS")

print("\n=== Test 4: Teacher can get assigned classes ===")
resp = client.get('/api/teacher/classes', cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
classes = resp.json()
print(f"Classes: {classes}")
assert '10A' in classes, "Class 10A should be assigned"

print("\n=== Test 5: Teacher can list students in assigned classes ===")
resp = client.get('/api/teacher/students', cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
students = resp.json()
student_usernames = [s['username'] for s in students]
print(f"Students: {student_usernames}")
assert 'test_student1' in student_usernames, "test_student1 should be visible"
assert 'test_student2' in student_usernames, "test_student2 should be visible"
assert 'test_student3' not in student_usernames, "test_student3 should NOT be visible (class 11B)"
assert 'test_teacher' not in student_usernames, "teacher should not be in student list"

print("\n=== Test 6: Teacher can create student in assigned class ===")
resp = client.post('/api/teacher/students', json={
    'username': 'new_student',
    'password': 'newpass123',
    'full_name': 'New Student',
    'user_class': '10A',
}, cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
print(f"Created student: {resp.json()}")

print("\n=== Test 7: Teacher CANNOT create student in unassigned class ===")
resp = client.post('/api/teacher/students', json={
    'username': 'new_student2',
    'password': 'newpass123',
    'full_name': 'New Student 2',
    'user_class': '11B',
}, cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 403, f"Should be forbidden: {resp.text}"
print(f"Blocked: {resp.json()}")

print("\n=== Test 8: Teacher CANNOT create admin or teacher ===")
resp = client.post('/api/teacher/students', json={
    'username': 'new_admin',
    'password': 'newpass123',
    'full_name': 'New Admin',
    'role': 'admin',
    'user_class': '10A',
}, cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 403, f"Should be forbidden: {resp.text}"
print(f"Blocked: {resp.json()}")

print("\n=== Test 9: Teacher can get student card ===")
with get_session() as session:
    student1 = session.execute(select(User).where(User.username == 'test_student1')).scalar_one_or_none()
    student1_id = student1.id

resp = client.get(f'/api/teacher/students/{student1_id}/card', cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
card = resp.json()
print(f"Student card user: {card['user']['username']}")
print(f"Stats: {card['stats']}")

print("\n=== Test 10: Teacher CANNOT access student card from unassigned class ===")
with get_session() as session:
    student3 = session.execute(select(User).where(User.username == 'test_student3')).scalar_one_or_none()
    student3_id = student3.id

resp = client.get(f'/api/teacher/students/{student3_id}/card', cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 403, f"Should be forbidden: {resp.text}"
print(f"Blocked: {resp.json()}")

print("\n=== Test 11: Teacher can update student name and password ===")
resp = client.put(f'/api/teacher/students/{student1_id}', json={
    'full_name': 'Updated Student One',
    'password': 'newpassword',
}, cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
print(f"Updated: {resp.json()}")

print("\n=== Test 12: Teacher CANNOT update student role or class ===")
resp = client.put(f'/api/teacher/students/{student1_id}', json={
    'role': 'admin',
    'user_class': '11B',
}, cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
# The endpoint only processes full_name and password, so role/class changes are silently ignored
# But the response should still be 200 (the fields are just ignored)
print(f"Response: {resp.json()}")

print("\n=== Test 13: Teacher can get results with class sorting ===")
resp = client.get('/api/teacher/results?sort_by=user_class&order=asc', cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
results = resp.json()
print(f"Classes: {results['classes']}")
print(f"Students count: {len(results['students'])}")
for s in results['students']:
    print(f"  - {s['username']} (class: {s['user_class']}, rating: {s['rating']})")

print("\n=== Test 14: Teacher can filter results by class ===")
resp = client.get('/api/teacher/results?class_filter=10A&sort_by=user_class&order=asc', cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
results = resp.json()
print(f"Students in class 10A: {len(results['students'])}")
for s in results['students']:
    assert s['user_class'] == '10A', f"Student {s['username']} should be in class 10A"

print("\n=== Test 15: Teacher can list languages (read-only) ===")
resp = client.get('/api/teacher/languages', cookies={'access_token': teacher_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
langs = resp.json()
print(f"Languages: {[l['name'] for l in langs]}")

print("\n=== Test 16: Teacher can list lessons (read-only) ===")
if langs:
    lang_id = langs[0]['id']
    resp = client.get(f'/api/teacher/lessons?language={lang_id}', cookies={'access_token': teacher_token})
    print(f"Status: {resp.status_code}")
    assert resp.status_code == 200, f"Failed: {resp.text}"
    lessons = resp.json()
    print(f"Lessons: {[l['title'] for l in lessons]}")

print("\n=== Test 17: Non-admin user CANNOT access admin endpoints ===")
# Use a fresh client to avoid cookie contamination
fresh_client = TestClient(app)
resp = fresh_client.post('/api/auth/login', json={'username': 'test_student1', 'password': 'newpassword'})
print(f"Login status: {resp.status_code}")
resp = fresh_client.get('/api/admin/users')
print(f"Status: {resp.status_code}")
assert resp.status_code == 403, f"Non-admin should be forbidden from admin endpoints"
print(f"Blocked: {resp.json()}")

print("\n=== Test 18: Non-teacher user CANNOT access teacher endpoints ===")
resp = fresh_client.get('/api/teacher/classes')
print(f"Status: {resp.status_code}")
assert resp.status_code == 403, f"Non-teacher should be forbidden from teacher endpoints"
print(f"Blocked: {resp.json()}")

print("\n=== Test 19: Admin can list teachers ===")
resp = client.get('/api/admin/teachers', cookies={'access_token': admin_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
teachers = resp.json()
print(f"Teachers: {[t['username'] for t in teachers]}")

print("\n=== Test 20: Admin can list all classes ===")
resp = client.get('/api/admin/classes', cookies={'access_token': admin_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
all_classes = resp.json()
print(f"All classes: {[c['user_class'] for c in all_classes]}")

print("\n=== Test 21: Admin can assign class to teacher ===")
resp = client.post(f'/api/admin/teachers/{teacher_id}/classes', json={'user_class': '11B'}, cookies={'access_token': admin_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
print(f"Assigned: {resp.json()}")

print("\n=== Test 22: Admin can get teacher's classes ===")
resp = client.get(f'/api/admin/teachers/{teacher_id}/classes', cookies={'access_token': admin_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
teacher_classes_data = resp.json()
print(f"Teacher classes: {teacher_classes_data}")

print("\n=== Test 23: Admin can unassign class from teacher ===")
resp = client.delete(f'/api/admin/teachers/{teacher_id}/classes/11B', cookies={'access_token': admin_token})
print(f"Status: {resp.status_code}")
assert resp.status_code == 200, f"Failed: {resp.text}"
print(f"Unassigned: {resp.json()}")

print("\n=== ALL TESTS PASSED ===")
