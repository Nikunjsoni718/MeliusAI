update public.opportunities as opportunity
set organization_id = organization.id::text
from public.organizations as organization
where nullif(trim(opportunity.organization_id), '') is null
  and lower(trim(opportunity.recruiter_name)) = lower(trim(organization.company_name));
