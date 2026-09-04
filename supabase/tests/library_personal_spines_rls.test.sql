begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'spine-owner-a@example.test'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'spine-owner-b@example.test'
  )
on conflict (id) do nothing;

insert into public.profiles (id, legacy_id, username)
values
  ('10000000-0000-0000-0000-000000000001', 900000001, 'spine-owner-a'),
  ('10000000-0000-0000-0000-000000000002', 900000002, 'spine-owner-b')
on conflict (id) do update
set legacy_id = excluded.legacy_id;

insert into public.books (id, title, author)
values
  (900000001, 'RLS spine one', 'Librélula'),
  (900000002, 'RLS spine two', 'Librélula'),
  (900000003, 'RLS spine three', 'Librélula')
on conflict (id) do nothing;

insert into public.user_books (legacy_user_id, book_id, status)
values
  (900000001, '900000001', 'reading'),
  (900000001, '900000002', 'planned'),
  (900000002, '900000003', 'reading')
on conflict (legacy_user_id, book_id) do nothing;

insert into public.user_book_spines (
  user_id,
  book_id,
  storage_path,
  show_text
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '900000001',
    '10000000-0000-0000-0000-000000000001/900000001/spine.jpg',
    false
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '900000003',
    '10000000-0000-0000-0000-000000000002/900000003/spine.jpg',
    false
  );

set local role anon;

select throws_ok(
  $$select * from public.user_book_spines$$,
  '42501',
  null,
  'anonymous users cannot access personal spine metadata'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.user_book_spines),
  1::bigint,
  'an authenticated user sees only their own spine rows'
);

select is(
  (
    select count(*)
    from public.user_book_spines
    where user_id = '10000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'an authenticated user cannot read another user spine row'
);

select lives_ok(
  $$
    update public.user_book_spines
    set show_text = true
    where book_id = '900000001'
  $$,
  'the owner can update the title visibility preference'
);

select is(
  (
    select show_text
    from public.user_book_spines
    where book_id = '900000001'
  ),
  true,
  'the title visibility preference is persisted'
);

select is_empty(
  $$
    update public.user_book_spines
    set show_text = true
    where user_id = '10000000-0000-0000-0000-000000000002'
    returning user_id
  $$,
  'the owner cannot update another user spine row'
);

select lives_ok(
  $$
    insert into public.user_book_spines (user_id, book_id, storage_path)
    values (
      '10000000-0000-0000-0000-000000000001',
      '900000002',
      '10000000-0000-0000-0000-000000000001/900000002/spine.jpg'
    )
  $$,
  'the owner can add a spine for a book in their library'
);

select throws_ok(
  $$
    insert into public.user_book_spines (user_id, book_id, storage_path)
    values (
      '10000000-0000-0000-0000-000000000001',
      '900000003',
      '10000000-0000-0000-0000-000000000001/900000003/spine.jpg'
    )
  $$,
  '42501',
  null,
  'the owner cannot add a spine for a book outside their library'
);

select is_empty(
  $$
    delete from public.user_book_spines
    where user_id = '10000000-0000-0000-0000-000000000002'
    returning user_id
  $$,
  'the owner cannot delete another user spine row'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.user_book_spines),
  1::bigint,
  'the second user still sees their own isolated spine row'
);

reset role;
select * from finish();

rollback;
