from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app, render_template
from flask_login import login_required, current_user
from models import Group, Post, Comment, GroupMembership, GroupInvitation
from app import db
from werkzeug.utils import secure_filename
import re, uuid, os

groups_bp = Blueprint("group", __name__)

def allowed_file(filename):
    allowed = current_app.config.get("ALLOWED_EXTENSIONS", {"png", "jpg", "jpeg", "gif", "webp", "mp4", "webm", "mov"})
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed

@groups_bp.route("/api/groups", methods=["POST"])
@login_required
def create_group():
    data = request.get_json()
    name = data.get('name').strip()
    description = data.get('description')

    if not name :

        return jsonify({"success": False, "message": "Name property is required."}), 400

    group = Group(
        name=name,
        description=description if description else "",
        owner_id=current_user.id
    )

    db.session.add(group)
    db.session.flush()  # get group.id

    # Add creator as member (admin)
    membership = GroupMembership(
        user_id=current_user.id,
        group_id=group.id,
        role="admin"
    )

    db.session.add(membership)
    db.session.commit()

    return jsonify(group.to_dict()), 201


@groups_bp.route("/api/groups/<int:group_id>/cover", methods=["PUT"])
@login_required
def upload_cover_picture(group_id):

    group = db.session.get(Group, group_id)
    old_picture_path = group.cover_picture

    if not group or group.owner_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    file = request.files.get('cover')
    
    if file:
        
        if not allowed_file(file.filename):

            return jsonify({'success': False, 'message': 'This picture format is not allowed.'}, 404)
        
        file_extension = file.filename.split('.')[-1].lower()
        filename = f"{uuid.uuid4()}.{file_extension}"
        upload_folder = os.path.join(current_app.config["UPLOAD_FOLDER"],"group_covers")

        os.makedirs(upload_folder, exist_ok=True)

        file.save(os.path.join(upload_folder, filename))

        file_path = f'File path: {upload_folder}'
        print(f'New Picture Path: {upload_folder}/{filename}')
        print(f'Old Picture Path: {old_picture_path}')

        #Deleting the old group picture.

        if old_picture_path is not None:
            if os.path.exists(old_picture_path):
                os.remove(old_picture_path)

        group.cover_picture= f'uploads/group_covers/{filename}'
        db.session.commit()
        
        return jsonify({"sucess":False, "message": "Picture successfully uploaded.", "path": file_path}), 200
    
    else:

        return jsonify({"sucess":False, "message": "The picture could not be saved."}), 404
    

@groups_bp.route('/api/groups/<int:group_id>')
@login_required
def render_group_detail(group_id):

    group = Group.query.get_or_404(group_id)

    return render_template('group_detail.html', group=group)


@groups_bp.route("/api/groups", methods=["GET"])
@login_required
def get_user_groups():
    memberships = GroupMembership.query.filter_by(user_id=current_user.id).all()
    groups = [m.group.to_dict(include_members=True) for m in memberships]

    return jsonify(groups), 200


@groups_bp.route('/api/groups/<int:group_id>/posts', methods=['GET'])
@login_required
def get_posts(group_id):

    group = Group.query.filter_by(id=group_id).first()
    posts = [p.to_dict() for p in group.posts]

    return jsonify(posts), 200


@groups_bp.route("/api/groups/<int:group_id>/posts", methods=["POST"])
@login_required
def create_post(group_id):

    print('I am inside the create_post endpoint.')

    content = request.form.get("content")
    article_url = request.form.get("article_url")
    media = request.files.get("media")

    if not content:
        return jsonify({"success": False, "message": "Post content is required"}), 400

    media_path = None
    media_type = None

    if media:

        print(allowed_file(media.filename))

        if not allowed_file(media.filename):

            return jsonify({'success': False, 'message': 'Format not allowed'}), 400
        
        media.seek(0, os.SEEK_END)
        file_size = media.tell()
        media.seek(0)

        if file_size > current_app.config['MAX_CONTENT_LENGTH']:

            return jsonify({'success': False, 'message': 'The file size exceeds 20MB.'}), 404
        
        file_extension = media.filename.split('.')[-1].lower()
        filename = f"{uuid.uuid4()}.{file_extension}"
        upload_folder = os.path.join(current_app.config["UPLOAD_FOLDER"], "post_media")

        os.makedirs(upload_folder, exist_ok=True)

        file_path = os.path.join(upload_folder, filename)
        print(f'Media Folder: {file_path}')

        media.save(file_path)

        media_path = f"uploads/post_media/{filename}"

        if media.mimetype.startswith("image"):
            media_type = "image"

        elif media.mimetype.startswith("video"):
            media_type = "video"

    post = Post(
        content=content,
        article_url=article_url,
        media_url=media_path,
        media_type=media_type,
        user_id=current_user.id,
        group_id=group_id
    )

    db.session.add(post)
    db.session.commit()

    return jsonify({"message": "Post created successfully",
                    "post": post.to_dict()}), 201


@groups_bp.route("/api/groups/<int:group_id>/invite", methods=["POST"])
@login_required
def invite_user(group_id):
    data = request.get_json()
    user_id = data.get("user_id")

    # Check if already member
    existing = GroupMembership.query.filter_by(
        user_id=user_id,
        group_id=group_id
    ).first()

    if existing:
        return jsonify({"error": "User already in group"}), 400

    # Check if invite already exists
    invite = GroupInvitation.query.filter_by(
        receiver_id=user_id,
        group_id=group_id,
        status="pending"
    ).first()

    if invite:
        return jsonify({"error": "Invitation already sent"}), 400

    invitation = GroupInvitation(
        group_id=group_id,
        sender_id=current_user.id,
        receiver_id=user_id
    )

    db.session.add(invitation)
    db.session.commit()

    return jsonify({"message": "Invitation sent"})

@groups_bp.route("/api/groups/invitations/<int:invite_id>/accept", methods=["POST"])
@login_required
def accept_invitation(invite_id):
    invite = GroupInvitation.query.get_or_404(invite_id)

    if invite.receiver_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403

    invite.status = "accepted"

    membership = GroupMembership(
        user_id=current_user.id,
        group_id=invite.group_id
    )

    db.session.add(membership)
    db.session.commit()

    return jsonify({"message": "Joined group"})


@groups_bp.route("/api/groups/invitations/<int:invite_id>/decline", methods=["POST"])
@login_required
def decline_invitation(invite_id):
    invite = GroupInvitation.query.get_or_404(invite_id)

    if invite.receiver_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403

    invite.status = "declined"
    db.session.commit()

    return jsonify({"message": "Invitation declined"})