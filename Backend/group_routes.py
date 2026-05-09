from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app, render_template
from flask_login import login_required, current_user
from models import Group, Post, Comment, PostLike, GroupMembership, GroupInvitation
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


@groups_bp.route("/api/groups/<int:group_id>", methods=["PUT"])
@login_required
def upload_cover_picture(group_id):

    group = db.session.get(Group, group_id)
    old_picture_path = group.cover_picture

    if not group or group.owner_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404
    
    group.name = request.form.get("name", group.name) if request.form.get("name", group.name) else group.name
    group.description = request.form.get("description", group.description) if request.form.get("description", group.description)  else group.description

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

        #Deleting the old group picture.
        if old_picture_path is not None:

            file_name = old_picture_path.split('/')[-1]
            upload_folder = os.path.join(current_app.config["UPLOAD_FOLDER"], "group_covers")

            if os.path.exists(os.path.join(upload_folder, file_name)):
                print(os.path.join(upload_folder, file_name))
                os.remove(os.path.join(upload_folder, file_name))

        group.cover_picture= f'uploads/group_covers/{filename}'
        db.session.commit()
        
        return jsonify({"success":True, "message": "Picture successfully uploaded.", 
                        "path": file_path,
                        "group": group.to_dict()}), 200
    
    else:

        return jsonify({"success":False, "message": "The picture could not be saved."}), 404
    

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


@groups_bp.route("/api/posts/<int:post_id>/comments", methods=["POST"])
@login_required
def add_comment(post_id):
    content = request.json.get("content")
    
    if not content or not content.strip():
        return jsonify({"success": False, "message": "Comment cannot be empty"}), 400

    try:
        comment = Comment(
            content=content.strip(),
            post_id=post_id,
            user_id=current_user.id
        )
        db.session.add(comment)
        db.session.commit()

        #To get date in DB
        db.session.refresh(comment)

        return jsonify({"success": True,
                        "comment": comment.to_dict()}), 201
    
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    
@groups_bp.route("/api/posts/<int:post_id>/like", methods=["POST"])
@login_required
def toggle_like(post_id):
    # if likes exist
    like = PostLike.query.filter_by(user_id=current_user.id, post_id=post_id).first()

    if like:
        db.session.delete(like)
        status = "unliked"
    else:
        new_like = PostLike(user_id=current_user.id, post_id=post_id)
        db.session.add(new_like)
        status = "liked"
    
    db.session.commit()
    
    total_likes = PostLike.query.filter_by(post_id=post_id).count()
    
    return jsonify({
        "success": True, 
        "status": status, 
        "total_likes": total_likes,
        "post_id": post_id
    }), 200

    
@groups_bp.route("/api/groups/<int:group_id>", methods=["DELETE"])
@login_required
def delete_group(group_id):
    group = Group.query.get_or_404(group_id)
    if group.owner_id != current_user.id:
        return jsonify({"message": "Unauthorized"}), 403
    
    db.session.delete(group)
    db.session.commit()
    return jsonify({"success": True})


@groups_bp.route("/api/posts/<int:post_id>", methods=["DELETE"])
@login_required
def delete_post(post_id):
    post = Post.query.get_or_404(post_id)
    old_media_url = post.media_url
    group_id = post.group_id

    if post.user_id != current_user.id:
        return jsonify({"message": "Unauthorised action for this user."}), 403
    
    db.session.delete(post)
    db.session.commit()

    if old_media_url is not None:
            
            file_name = old_media_url.split('/')[-1]
            upload_folder = os.path.join(current_app.config["UPLOAD_FOLDER"], "post_media")

            if os.path.exists(os.path.join(upload_folder, file_name)):
                print(os.path.join(upload_folder, file_name))
                os.remove(os.path.join(upload_folder, file_name))

    return jsonify({"success": True, "group_id": group_id}), 200


@groups_bp.route("/api/comments/<int:comment_id>", methods=["DELETE"])
@login_required
def delete_comment(comment_id):
    comment = Comment.query.get_or_404(comment_id)
    post_id = comment.post_id
    if comment.user_id != current_user.id:
        return jsonify({"message": "Unauthorised action for this user."}), 403
    
    db.session.delete(comment)
    db.session.commit()
    return jsonify({"success": True, "post_id": post_id}), 200


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