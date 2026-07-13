import { useEffect, useState } from "react";
import { publicUrl } from "./api.js";
import {
followProfile,
getFollowingProfiles,
getMySocialProfile,
searchProfileByFriendCode,
unfollowProfile,
} from "./lib/friendsApi.js";
import "./AddFriends.css";

function profileName(profile) {
return profile?.display_name || profile?.username || "Lectora";
}

function profileAvatar(profile) {
const avatar = String(profile?.avatar || "").trim();

if (!avatar || avatar === "default.jpg") {
    return publicUrl("images/avatar/avatar1.png");
}

return publicUrl(avatar);
}

async function fetchSocialData() {
  const [profile, following] = await Promise.all([
    getMySocialProfile(),
    getFollowingProfiles(),
  ]);

  return { profile, following };
}
export default function AddFriends({ onOpenProfile }) {
const [myProfile, setMyProfile] = useState(null);
const [friends, setFriends] = useState([]);
const [friendCode, setFriendCode] = useState("");
const [result, setResult] = useState(null);
const [message, setMessage] = useState("");
const [error, setError] = useState("");
const [loading, setLoading] = useState(true);
const [searching, setSearching] = useState(false);
const [savingId, setSavingId] = useState("");

async function loadSocialData() {
  setError("");

  try {
    const { profile, following } = await fetchSocialData();

    setMyProfile(profile);
    setFriends(following);
  } catch (requestError) {
    setError(requestError.message || "No se pudo cargar Añadir amigos.");
  }
}

useEffect(() => {
  let isMounted = true;

  fetchSocialData()
    .then(({ profile, following }) => {
      if (!isMounted) return;

      setMyProfile(profile);
      setFriends(following);
    })
    .catch((requestError) => {
      if (!isMounted) return;

      setError(requestError.message || "No se pudo cargar Añadir amigos.");
    })
    .finally(() => {
      if (isMounted) {
        setLoading(false);
      }
    });

  return () => {
    isMounted = false;
  };
}, []);

async function copyCode() {
    if (!myProfile?.friend_code) return;

    try {
    await navigator.clipboard.writeText(myProfile.friend_code);
    setMessage("Código copiado.");
    setError("");
    } catch {
    setError("No se pudo copiar el código. Puedes seleccionarlo manualmente.");
    }
}

async function searchFriend(event) {
    event.preventDefault();

    setSearching(true);
    setMessage("");
    setError("");
    setResult(null);

    try {
    const foundProfile = await searchProfileByFriendCode(friendCode);

    if (!foundProfile) {
        setMessage("No hemos encontrado a nadie con ese código.");
        return;
    }

    setResult(foundProfile);
    } catch (requestError) {
    setError(requestError.message || "No se pudo buscar ese código.");
    } finally {
    setSearching(false);
    }
}

async function followResult(profile) {
    if (!profile?.id) return;

    setSavingId(profile.id);
    setMessage("");
    setError("");

    try {
    await followProfile(profile.id);
    setResult((current) =>
        current?.id === profile.id
        ? {
            ...current,
            is_following: true,
            }
        : current,
    );
    await loadSocialData();
    setMessage(`${profileName(profile)} ahora está en tus amigos.`);
    } catch (requestError) {
    setError(requestError.message || "No se pudo seguir a esta persona.");
    } finally {
    setSavingId("");
    }
}

async function unfollowFriend(profile) {
    if (!profile?.id) return;

    setSavingId(profile.id);
    setMessage("");
    setError("");

    try {
    await unfollowProfile(profile.id);
    setFriends((current) => current.filter((item) => item.id !== profile.id));
    setResult((current) =>
        current?.id === profile.id
        ? {
            ...current,
            is_following: false,
            }
        : current,
    );
    setMessage(`Has dejado de seguir a ${profileName(profile)}.`);
    } catch (requestError) {
    setError(requestError.message || "No se pudo dejar de seguir.");
    } finally {
    setSavingId("");
    }
}

return (
    <main className="friends-page">
    <section className="friends-shell">
        <header className="friends-hero">
        <div>
            <span className="friends-kicker">Comunidad Librélula</span>
            <h1>Añadir amigos</h1>
            <p>
            Comparte tu Código Librélula o busca el de otra lectora para seguirla.
            </p>
        </div>

        <button type="button" onClick={onOpenProfile}>
            Volver a Mi rincón
        </button>
        </header>

        {loading && (
        <section className="friends-card">
            <p>Cargando tu rincón social…</p>
        </section>
        )}

        {!loading && (
        <>
            <section className="friends-grid">
            <article className="friends-card friends-code-card">
                <span className="friends-card-label">Tu Código Librélula</span>
                <strong>{myProfile?.friend_code || "Generando…"}</strong>
                <p>
                Pásale este código a tus amigos para que puedan encontrarte sin usar tu email.
                </p>
                <button type="button" onClick={copyCode}>
                Copiar código
                </button>
            </article>

            <article className="friends-card">
                <span className="friends-card-label">Buscar por código</span>
                <form className="friends-search" onSubmit={searchFriend}>
                <label htmlFor="friend-code">Código de tu amiga</label>
                <div>
                    <input
                    id="friend-code"
                    type="text"
                    placeholder="LBR-7KQ2-M9"
                    value={friendCode}
                    onChange={(event) => setFriendCode(event.target.value)}
                    />
                    <button type="submit" disabled={searching}>
                    {searching ? "Buscando…" : "Buscar"}
                    </button>
                </div>
                </form>
            </article>
            </section>

            {error && <p className="friends-message is-error">{error}</p>}
            {message && <p className="friends-message">{message}</p>}

            {result && (
            <section className="friends-results">
                <h2>Resultado</h2>
                <article className="friend-profile-card">
                <img
                    src={profileAvatar(result)}
                    alt={`Avatar de ${profileName(result)}`}
                    onError={(event) => {
                    event.currentTarget.src = publicUrl("images/avatar/avatar1.png");
                    }}
                />

                <div>
                    <span>{result.friend_code}</span>
                    <h3>{profileName(result)}</h3>
                    <p>{result.bio || "Esta lectora todavía no ha escrito su bio."}</p>
                </div>

                {result.is_self ? (
                    <span className="friends-pill">Eres tú</span>
                ) : result.is_following ? (
                    <button
                    type="button"
                    className="friends-secondary-btn"
                    disabled={savingId === result.id}
                    onClick={() => unfollowFriend(result)}
                    >
                    {savingId === result.id ? "Actualizando…" : "Siguiendo"}
                    </button>
                ) : (
                    <button
                    type="button"
                    disabled={savingId === result.id}
                    onClick={() => followResult(result)}
                    >
                    {savingId === result.id ? "Añadiendo…" : "Seguir"}
                    </button>
                )}
                </article>
            </section>
            )}

            <section className="friends-results">
            <h2>Mis amigos</h2>

            {friends.length === 0 ? (
                <article className="friends-empty">
                <p>Todavía no sigues a nadie. Pide un Código Librélula para empezar.</p>
                </article>
            ) : (
                <div className="friends-list">
                {friends.map((friend) => (
                    <article className="friend-profile-card" key={friend.id}>
                    <img
                        src={profileAvatar(friend)}
                        alt={`Avatar de ${profileName(friend)}`}
                        onError={(event) => {
                        event.currentTarget.src = publicUrl("images/avatar/avatar1.png");
                        }}
                    />

                    <div>
                        <span>{friend.friend_code}</span>
                        <h3>{profileName(friend)}</h3>
                        <p>{friend.bio || "Sin bio todavía."}</p>
                    </div>

                    <button
                        type="button"
                        className="friends-secondary-btn"
                        disabled={savingId === friend.id}
                        onClick={() => unfollowFriend(friend)}
                    >
                        {savingId === friend.id ? "Actualizando…" : "Siguiendo"}
                    </button>
                    </article>
                ))}
                </div>
            )}
            </section>
        </>
        )}
    </section>
    </main>
);
}