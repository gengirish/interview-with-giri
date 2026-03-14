"""Decision tree CRUD and analytics API."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import (
    DecisionTreeCreate,
    DecisionTreeResponse,
)
from interviewbot.models.tables import InterviewDecisionTree, InterviewSession
from interviewbot.services.tree_engine import (
    compute_path_analytics,
    validate_tree,
)

router = APIRouter(prefix="/decision-trees", tags=["Decision Trees"])


class ValidateTreeRequest(BaseModel):
    tree_data: dict = {}


class TreeUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    role_type: str | None = None
    tree_data: dict | None = None


def _to_response(tree: InterviewDecisionTree) -> DecisionTreeResponse:
    return DecisionTreeResponse(
        id=tree.id,
        name=tree.name,
        description=tree.description,
        role_type=tree.role_type,
        tree_data=tree.tree_data or {},
        is_published=tree.is_published,
        usage_count=tree.usage_count or 0,
        created_at=tree.created_at,
    )


async def _get_tree_or_404(
    db: AsyncSession, org_id: UUID, tree_id: UUID
) -> InterviewDecisionTree:
    result = await db.execute(
        select(InterviewDecisionTree).where(
            InterviewDecisionTree.id == tree_id,
            InterviewDecisionTree.org_id == org_id,
        )
    )
    tree = result.scalar_one_or_none()
    if not tree:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decision tree not found")
    return tree


@router.get("", response_model=list[DecisionTreeResponse])
async def list_decision_trees(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[DecisionTreeResponse]:
    """List all decision trees for the org."""
    result = await db.execute(
        select(InterviewDecisionTree)
        .where(InterviewDecisionTree.org_id == org_id)
        .order_by(InterviewDecisionTree.updated_at.desc())
    )
    trees = result.scalars().all()
    return [_to_response(t) for t in trees]


@router.post("", response_model=DecisionTreeResponse, status_code=status.HTTP_201_CREATED)
async def create_decision_tree(
    req: DecisionTreeCreate,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> DecisionTreeResponse:
    """Create a new decision tree."""
    tree = InterviewDecisionTree(
        org_id=org_id,
        name=req.name,
        description=req.description or None,
        role_type=req.role_type or None,
        tree_data=req.tree_data or {},
        created_by=UUID(str(user["sub"])) if user.get("sub") else None,
    )
    db.add(tree)
    await db.commit()
    await db.refresh(tree)
    return _to_response(tree)


@router.get("/{tree_id}", response_model=DecisionTreeResponse)
async def get_decision_tree(
    tree_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> DecisionTreeResponse:
    """Get a decision tree by ID with usage stats."""
    tree = await _get_tree_or_404(db, org_id, tree_id)
    return _to_response(tree)


@router.put("/{tree_id}", response_model=DecisionTreeResponse)
async def update_decision_tree(
    tree_id: UUID,
    req: TreeUpdateRequest,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> DecisionTreeResponse:
    """Update a decision tree."""
    tree = await _get_tree_or_404(db, org_id, tree_id)
    if req.name is not None:
        tree.name = req.name
    if req.description is not None:
        tree.description = req.description
    if req.role_type is not None:
        tree.role_type = req.role_type
    if req.tree_data is not None:
        tree.tree_data = req.tree_data
    await db.commit()
    await db.refresh(tree)
    return _to_response(tree)


@router.delete("/{tree_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_decision_tree(
    tree_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> None:
    """Delete a decision tree."""
    tree = await _get_tree_or_404(db, org_id, tree_id)
    await db.delete(tree)
    await db.commit()


@router.post("/{tree_id}/publish", response_model=DecisionTreeResponse)
async def publish_decision_tree(
    tree_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> DecisionTreeResponse:
    """Publish or unpublish a decision tree."""
    tree = await _get_tree_or_404(db, org_id, tree_id)
    tree.is_published = not tree.is_published
    await db.commit()
    await db.refresh(tree)
    return _to_response(tree)


@router.post("/{tree_id}/duplicate", response_model=DecisionTreeResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_decision_tree(
    tree_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> DecisionTreeResponse:
    """Clone a decision tree."""
    source = await _get_tree_or_404(db, org_id, tree_id)
    tree = InterviewDecisionTree(
        org_id=org_id,
        name=f"{source.name} (Copy)",
        description=source.description,
        role_type=source.role_type,
        tree_data=source.tree_data or {},
        is_published=False,
        usage_count=0,
        created_by=UUID(str(user["sub"])) if user.get("sub") else None,
    )
    db.add(tree)
    await db.commit()
    await db.refresh(tree)
    return _to_response(tree)


@router.post("/validate")
async def validate_decision_tree(
    req: ValidateTreeRequest,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
) -> dict:
    """Validate tree structure without saving."""
    return validate_tree(req.tree_data or {})


@router.get("/{tree_id}/analytics")
async def get_tree_analytics(
    tree_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Get path analytics for sessions using this decision tree."""
    tree = await _get_tree_or_404(db, org_id, tree_id)
    result = await db.execute(
        select(InterviewSession.tree_state).where(
            InterviewSession.decision_tree_id == tree_id,
            InterviewSession.org_id == org_id,
            InterviewSession.tree_state.isnot(None),
        )
    )
    rows = result.scalars().all()
    tree_states = [r[0] for r in rows if r[0]]
    return compute_path_analytics(tree_states, tree.tree_data or {})
