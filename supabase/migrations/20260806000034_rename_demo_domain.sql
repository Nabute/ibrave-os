-- ----------------------------------------------------------------------------
-- Move every @ibrave.dev account to @ibrave.co. User-initiated email sends
-- From = the user's login address, and Resend only accepts verified domains —
-- ibrave.co is the company's real (verifiable) domain, ibrave.dev was a seed
-- artifact. Updates auth.users, the email identity payload (auth.identities.
-- email is generated from identity_data), and public.profiles, which is
-- everything the password grant and the From-validation check read.
-- ----------------------------------------------------------------------------
do $$
declare
  u record;
  new_email text;
begin
  for u in select id, email from auth.users where email like '%@ibrave.dev' loop
    new_email := replace(u.email, '@ibrave.dev', '@ibrave.co');

    update auth.users
      set email = new_email
      where id = u.id;

    update auth.identities
      set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(new_email))
      where user_id = u.id and provider = 'email';

    update public.profiles
      set email = new_email
      where id = u.id;
  end loop;
end;
$$;
