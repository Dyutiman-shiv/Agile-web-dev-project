"""
Seed the database with realistic fake data.
Run from the Backend/ directory:  python seed.py
Safe to re-run — skips users/groups that already exist.
"""

import sys
import os

# Make sure imports resolve when run directly
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timezone, timedelta
from app import create_app, db
from models import (
    User, Group, GroupMembership, Post, Comment, PostLike,
    GroupInvitation, Notification,
)

app = create_app()

# ── Seed data definitions ─────────────────────────────────────────────────────

USERS = [
    {
        "username": "alice_chen",
        "email": "alice@bamboobox.test",
        "password": "password123",
        "friend_code": "STUDYGRP",   # S T U D Y G R P  – all valid chars
    },
    {
        "username": "bob_smith",
        "email": "bob@bamboobox.test",
        "password": "password123",
        "friend_code": "CAMPUSBK",   # C A M P U S B K
    },
    {
        "username": "carol_jones",
        "email": "carol@bamboobox.test",
        "password": "password123",
        "friend_code": "TEAMMATE",   # T E A M M A T E
    },
    {
        "username": "david_kim",
        "email": "david@bamboobox.test",
        "password": "password123",
        "friend_code": "FRESHMEN",   # F R E S H M E N
    },
    {
        "username": "emma_wilson",
        "email": "emma@bamboobox.test",
        "password": "password123",
        "friend_code": "QUANTUMY",   # Q U A N T U M Y
    },
]

GROUPS = [
    {
        "name": "Algorithms Study Group",
        "description": "Weekly deep-dives into data structures, complexity analysis, and competitive programming problems. All levels welcome!",
        "owner": "alice_chen",
        "admins": ["bob_smith"],
        "members": ["carol_jones", "david_kim"],
    },
    {
        "name": "Campus Volleyball Club",
        "description": "Casual and competitive volleyball sessions every Tuesday and Thursday. Bring your friends and some sunscreen ☀️",
        "owner": "bob_smith",
        "admins": [],
        "members": ["alice_chen", "david_kim", "emma_wilson"],
    },
    {
        "name": "Machine Learning Hub",
        "description": "Exploring ML papers, Kaggle competitions, and building cool side-projects together. Python and PyTorch are our tools of choice.",
        "owner": "carol_jones",
        "admins": ["alice_chen"],
        "members": ["david_kim", "emma_wilson"],
    },
]

POSTS = {
    "Algorithms Study Group": [
        {
            "author": "alice_chen",
            "content": "Hey everyone! 👋 This week we're covering dynamic programming. I've put together a curated list of 10 LeetCode problems sorted by difficulty. Check your DMs for the Google Doc link. Let's aim to finish at least 5 before Saturday's session.",
            "comments": [
                ("bob_smith",   "Amazing, I've been struggling with DP for months. This is exactly what I needed!"),
                ("carol_jones", "Can we also cover memoisation vs tabulation? I always mix them up."),
                ("david_kim",   "Alice you're a legend 🙌"),
                ("alice_chen",  "Carol — yes absolutely, I'll add a dedicated section for that!"),
            ],
            "likes": ["bob_smith", "carol_jones", "david_kim"],
        },
        {
            "author": "bob_smith",
            "content": "Just cracked the 'Edit Distance' problem after 2 hours 😅 The key insight is treating it as a 2D DP table where dp[i][j] = min operations to convert s1[:i] to s2[:j]. Happy to walk anyone through it on Saturday.",
            "comments": [
                ("carol_jones", "Wait this actually makes sense now. I was overcomplicating it."),
                ("alice_chen",  "Great explanation Bob! Add it to the shared notes doc 📝"),
            ],
            "likes": ["alice_chen", "carol_jones"],
        },
        {
            "author": "carol_jones",
            "content": "Reminder: Saturday's session is at 2pm in the library, Room G14. Bring your laptops! We'll do a live coding session — first problem is 'Longest Increasing Subsequence'. See you all there 🚀",
            "comments": [
                ("david_kim",  "Room G14 noted! What if it's booked?"),
                ("carol_jones","David — I've reserved it until 6pm, we're good!"),
                ("bob_smith",  "See you there 💪"),
            ],
            "likes": ["alice_chen", "bob_smith", "david_kim"],
        },
    ],
    "Campus Volleyball Club": [
        {
            "author": "bob_smith",
            "content": "Great game on Tuesday everyone! Final score 3-2 in the 5th set — absolute nail-biter 🏐 Shoutout to Emma for those back-to-back aces in the final set. We're playing again Thursday at 5pm. Court 3 is booked!",
            "comments": [
                ("emma_wilson", "That was SO fun!! I've been practising my serve all week haha"),
                ("alice_chen",  "Can't make Thursday but I'll be there next Tuesday for sure!"),
                ("david_kim",   "The 4th set comeback was unreal. GG everyone 🔥"),
            ],
            "likes": ["alice_chen", "david_kim", "emma_wilson"],
        },
        {
            "author": "emma_wilson",
            "content": "For anyone who wants to level up their serve, I found this amazing breakdown video by an Olympic coach. It changed my technique completely — especially the wrist snap at contact. Will share the link in Thursday's warm-up!",
            "comments": [
                ("bob_smith",  "Please share it! My serve is embarrassingly weak 😂"),
                ("david_kim",  "Emma the secret weapon reveals her secrets 👀"),
            ],
            "likes": ["bob_smith", "david_kim"],
        },
        {
            "author": "david_kim",
            "content": "Quick poll: should we sign up for the inter-university tournament next month? Entry is $10 per person and we'd need a squad of 8. I think we can place top 3 if we start practising some proper formations. Drop a 👍 in the comments if you're in!",
            "comments": [
                ("bob_smith",   "👍 100% in. Let's go!"),
                ("emma_wilson", "👍 I'm so in. Let's win this thing."),
                ("alice_chen",  "👍 Sign me up! When do we need to confirm by?"),
                ("david_kim",   "Registration deadline is the 20th — we have time. I'll start the entry form!"),
            ],
            "likes": ["bob_smith", "emma_wilson", "alice_chen"],
        },
    ],
    "Machine Learning Hub": [
        {
            "author": "carol_jones",
            "content": "Just finished reading 'Attention Is All You Need' for the third time and it finally clicked 🤯 The key is understanding that self-attention is just a learned weighted average of value vectors. Next meetup I'll do a whiteboard walkthrough — no slides, just vibes and maths.",
            "comments": [
                ("alice_chen",  "Carol this is the explanation I've been waiting for. Please record it!"),
                ("emma_wilson", "I've been putting this paper off for months. Maybe it's finally time 😅"),
                ("david_kim",   "The multi-head part always loses me. Will you cover that too?"),
                ("carol_jones", "Yes David, multi-head attention is the highlight honestly!"),
            ],
            "likes": ["alice_chen", "david_kim", "emma_wilson"],
        },
        {
            "author": "alice_chen",
            "content": "Started a new Kaggle competition — 'Predict Student Performance'. I've got a baseline XGBoost model at 0.82 AUC. Going to try stacking it with a LightGBM next. Anyone want to team up? Better to collaborate than compete on practice comps 🤝",
            "comments": [
                ("carol_jones", "I'm in! I've been wanting to try feature engineering on tabular data."),
                ("david_kim",   "Count me in too. What's the feature set looking like?"),
                ("alice_chen",  "12 numerical features, 4 categorical. Pretty clean dataset actually!"),
            ],
            "likes": ["carol_jones", "david_kim"],
        },
        {
            "author": "david_kim",
            "content": "Hot take: most ML engineers spend 80% of their time on data cleaning and only 20% on actual models. And that's fine — garbage in, garbage out. Spent today building a proper validation pipeline and my model accuracy jumped 6%. Clean data > fancy architecture 🧹",
            "comments": [
                ("emma_wilson", "This is so true. I learned this the hard way on my last project 💀"),
                ("carol_jones", "Preach. I've seen papers with SOTA benchmarks fall apart on real-world dirty data."),
                ("alice_chen",  "The boring stuff is the important stuff. Saving this post."),
            ],
            "likes": ["alice_chen", "carol_jones", "emma_wilson"],
        },
    ],
}

# ── Helper ─────────────────────────────────────────────────────────────────────

def ago(days=0, hours=0, minutes=0):
    return datetime.now(timezone.utc) - timedelta(days=days, hours=hours, minutes=minutes)


# ── Main seed ─────────────────────────────────────────────────────────────────

def seed():
    with app.app_context():

        # ── 1. Users ──────────────────────────────────────────────────────────
        user_map = {}
        for u in USERS:
            existing = User.query.filter_by(email=u["email"]).first()
            if existing:
                print(f"  [skip] User already exists: {u['username']}")
                user_map[u["username"]] = existing
                continue

            user = User(
                username=u["username"],
                email=u["email"],
                friend_code=u["friend_code"],
            )
            user.set_password(u["password"])
            db.session.add(user)
            db.session.flush()  # get user.id before commit
            user_map[u["username"]] = user
            print(f"  [add]  User: {u['username']}  |  friend code: {u['friend_code']}")

        db.session.commit()

        # ── 2. Groups & memberships ───────────────────────────────────────────
        group_map = {}
        for g in GROUPS:
            existing = Group.query.filter_by(name=g["name"]).first()
            if existing:
                print(f"  [skip] Group already exists: {g['name']}")
                group_map[g["name"]] = existing
                continue

            owner = user_map[g["owner"]]
            group = Group(
                name=g["name"],
                description=g["description"],
                owner_id=owner.id,
                created_at=ago(days=14),
            )
            db.session.add(group)
            db.session.flush()

            # Owner membership
            db.session.add(GroupMembership(
                user_id=owner.id,
                group_id=group.id,
                role="owner",
                joined_at=ago(days=14),
            ))

            for admin_name in g.get("admins", []):
                db.session.add(GroupMembership(
                    user_id=user_map[admin_name].id,
                    group_id=group.id,
                    role="admin",
                    joined_at=ago(days=13),
                ))

            for member_name in g.get("members", []):
                db.session.add(GroupMembership(
                    user_id=user_map[member_name].id,
                    group_id=group.id,
                    role="member",
                    joined_at=ago(days=12),
                ))

            group_map[g["name"]] = group
            print(f"  [add]  Group: {g['name']}")

        db.session.commit()

        # ── 3. Posts, comments, likes ─────────────────────────────────────────
        base_time = ago(days=10)

        for group_name, posts in POSTS.items():
            group = group_map.get(group_name)
            if group is None:
                continue

            existing_posts = Post.query.filter_by(group_id=group.id).count()
            if existing_posts:
                print(f"  [skip] Posts already exist in: {group_name}")
                continue

            for i, p in enumerate(posts):
                post_time = base_time + timedelta(days=i, hours=i * 3)
                post = Post(
                    content=p["content"],
                    user_id=user_map[p["author"]].id,
                    group_id=group.id,
                    created_at=post_time,
                )
                db.session.add(post)
                db.session.flush()

                # Comments
                for j, (commenter, comment_text) in enumerate(p.get("comments", [])):
                    db.session.add(Comment(
                        content=comment_text,
                        user_id=user_map[commenter].id,
                        post_id=post.id,
                        created_at=post_time + timedelta(minutes=30 + j * 15),
                    ))

                # Likes
                for liker in p.get("likes", []):
                    db.session.add(PostLike(
                        user_id=user_map[liker].id,
                        post_id=post.id,
                    ))

            print(f"  [add]  Posts for: {group_name}")

        db.session.commit()

        # ── 4. One pending invitation (emma invites david to ML Hub) ──────────
        ml_group = group_map.get("Machine Learning Hub")
        if ml_group:
            already = GroupInvitation.query.filter_by(
                group_id=ml_group.id,
                receiver_id=user_map["emma_wilson"].id,
                status="pending",
            ).first()
            if not already:
                db.session.add(GroupInvitation(
                    group_id=ml_group.id,
                    sender_id=user_map["carol_jones"].id,
                    receiver_id=user_map["emma_wilson"].id,
                    status="pending",
                    created_at=ago(hours=2),
                ))
                print("  [add]  Sample pending invitation: carol -> emma (ML Hub)")
            db.session.commit()

        # ── Summary ───────────────────────────────────────────────────────────
        print("\n" + "="*52)
        print("  SEED COMPLETE — Fake User Credentials")
        print("="*52)
        for u in USERS:
            user_obj = User.query.filter_by(email=u["email"]).first()
            fc = user_obj.friend_code if user_obj else u["friend_code"]
            print(f"  {u['username']:<18}  pw: password123   code: {fc}")
        print("="*52)


if __name__ == "__main__":
    seed()
