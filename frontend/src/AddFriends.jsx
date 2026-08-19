import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const AddFriendsImpl = lazy(() => import("./AddFriendsImpl.jsx"));

export default function AddFriends(props) {
  return (
    <DeferredPage title="Buscando lectoras…" text="Estamos preparando tu círculo lector.">
      <AddFriendsImpl {...props} />
    </DeferredPage>
  );
}
