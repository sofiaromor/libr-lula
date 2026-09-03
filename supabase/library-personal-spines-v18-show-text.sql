-- Librélula · Shelf Studio v1
-- Allow users to decide whether generated spine text is displayed over personal spine photos.

alter table public.user_book_spines
add column if not exists show_text boolean not null default true;

comment on column public.user_book_spines.show_text is
'Controls whether Librélula renders automatic title text over a personal spine image.';
