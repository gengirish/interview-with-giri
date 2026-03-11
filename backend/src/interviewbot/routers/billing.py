import json
from uuid import UUID

import structlog
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.config import get_settings
from interviewbot.dependencies import get_current_user, get_db, get_org_id
from interviewbot.models.schemas import CheckoutRequest, SubscriptionResponse
from interviewbot.models.tables import Organization, Subscription

logger = structlog.get_logger()

router = APIRouter(prefix="/billing", tags=["Billing"])

PLAN_CONFIGS = {
    "starter": {
        "name": "Starter",
        "price_monthly": 9900,  # $99 in cents
        "interviews_limit": 50,
        "max_users": 2,
        "allowed_formats": ["text"],
    },
    "professional": {
        "name": "Professional",
        "price_monthly": 29900,  # $299
        "interviews_limit": 200,
        "max_users": 10,
        "allowed_formats": ["text", "voice"],
    },
    "enterprise": {
        "name": "Enterprise",
        "price_monthly": 79900,  # $799
        "interviews_limit": 999999,
        "max_users": 999999,
        "allowed_formats": ["text", "voice", "video"],
    },
}


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> SubscriptionResponse:
    result = await db.execute(
        select(Subscription)
        .where(Subscription.org_id == org_id, Subscription.status == "active")
        .order_by(Subscription.created_at.desc())
    )
    sub = result.scalar_one_or_none()

    if not sub:
        return SubscriptionResponse(
            plan_tier="free",
            interviews_limit=10,
            interviews_used=0,
            interviews_remaining=10,
            can_interview=True,
            allowed_formats=["text"],
            status="active",
        )

    plan = PLAN_CONFIGS.get(sub.plan_tier, PLAN_CONFIGS["starter"])
    remaining = max(0, sub.interviews_limit - sub.interviews_used)

    return SubscriptionResponse(
        plan_tier=sub.plan_tier,
        interviews_limit=sub.interviews_limit,
        interviews_used=sub.interviews_used,
        interviews_remaining=remaining,
        can_interview=remaining > 0,
        allowed_formats=plan["allowed_formats"],
        status=sub.status,
    )


@router.post("/checkout")
async def create_checkout(
    req: CheckoutRequest,
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stripe not configured")

    stripe.api_key = settings.stripe_secret_key
    plan = PLAN_CONFIGS.get(req.plan_id)
    if not plan:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid plan")

    org_result = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    org = org_result.scalar_one_or_none()
    org_name = org.name if org else "Organization"

    try:
        checkout_session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"InterviewBot {plan['name']}",
                        "description": f"Up to {plan['interviews_limit']} interviews/month",
                    },
                    "unit_amount": plan["price_monthly"],
                    "recurring": {"interval": "month"},
                },
                "quantity": 1,
            }],
            metadata={
                "org_id": str(org_id),
                "plan_id": req.plan_id,
            },
            success_url=req.success_url,
            cancel_url=req.cancel_url,
            client_reference_id=str(org_id),
        )
        return {"url": checkout_session.url}
    except stripe.StripeError as e:
        logger.error("stripe_checkout_error", error=str(e))
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Stripe error")


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Webhook not configured")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    stripe.api_key = settings.stripe_secret_key

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid webhook signature")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        org_id = data.get("metadata", {}).get("org_id")
        plan_id = data.get("metadata", {}).get("plan_id")
        stripe_customer_id = data.get("customer")
        stripe_sub_id = data.get("subscription")

        if org_id and plan_id:
            plan = PLAN_CONFIGS.get(plan_id, PLAN_CONFIGS["starter"])
            sub = Subscription(
                org_id=org_id,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_sub_id,
                plan_tier=plan_id,
                interviews_limit=plan["interviews_limit"],
                interviews_used=0,
                status="active",
            )
            db.add(sub)
            await db.commit()
            logger.info("subscription_created", org_id=org_id, plan=plan_id)

    elif event_type == "customer.subscription.deleted":
        stripe_sub_id = data.get("id")
        result = await db.execute(
            select(Subscription).where(
                Subscription.stripe_subscription_id == stripe_sub_id
            )
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = "cancelled"
            await db.commit()
            logger.info("subscription_cancelled", sub_id=str(sub.id))

    elif event_type == "invoice.payment_failed":
        stripe_sub_id = data.get("subscription")
        result = await db.execute(
            select(Subscription).where(
                Subscription.stripe_subscription_id == stripe_sub_id
            )
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = "past_due"
            await db.commit()
            logger.warning("payment_failed", sub_id=str(sub.id))

    return {"received": True}


@router.get("/plans")
async def get_plans() -> list[dict]:
    return [
        {
            "id": plan_id,
            "name": config["name"],
            "price_monthly": config["price_monthly"] / 100,
            "interviews_limit": config["interviews_limit"],
            "max_users": config["max_users"],
            "allowed_formats": config["allowed_formats"],
        }
        for plan_id, config in PLAN_CONFIGS.items()
    ]
