import asyncio

from main import extract_bio_data, get_supabase_service_role_client


async def run_backfill():
    supabase = get_supabase_service_role_client()
    response = await asyncio.to_thread(
        lambda: (
            supabase.table("profiles")
            .select("id, bio")
            .not_.is_("bio", "null")
            .is_("extracted_experience", "null")
            .execute()
        )
    )
    profiles = response.data or []

    for row in profiles:
        print(f"Processing profile ID: {row['id']}...", flush=True)
        extracted_data = await extract_bio_data(row["bio"])

        await asyncio.to_thread(
            lambda profile_id=row["id"], data=extracted_data: (
                supabase.table("profiles")
                .update(
                    {
                        "extracted_experience": data["experience"],
                        "extracted_preferences": data["preferences"],
                    }
                )
                .eq("id", profile_id)
                .execute()
            )
        )
        await asyncio.sleep(1)

    print(f"Backfill complete. Successfully processed {len(profiles)} profiles.")


if __name__ == "__main__":
    asyncio.run(run_backfill())
