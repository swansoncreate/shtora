import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenField = z.string().max(8000).optional();

async function tokenOf(token: string | undefined) {
  const { dropboxWithRefresh } = await import("./live.server");
  return dropboxWithRefresh(token || "", async (live) => live);
}

async function via<T>(name: string, data: unknown, local: () => Promise<T>): Promise<T> {
  const { proxyOr } = await import("@/lib/server/remote");
  return proxyOr(name, data, local);
}

export const checkDropbox = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenField }))
  .handler(async ({ data }) =>
    via("dbx.account", data, async () => {
      const { getDropboxAccount } = await import("./dropbox.server");
      return getDropboxAccount(await tokenOf(data.token));
    }),
  );

export const listFolders = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenField, path: z.string().max(1000).optional() }))
  .handler(async ({ data }) =>
    via("dbx.folders", data, async () => {
      const { listDropboxFolders } = await import("./dropbox.server");
      return listDropboxFolders(await tokenOf(data.token), data.path ?? "");
    }),
  );

export const listEntries = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenField, path: z.string().max(1000).optional() }))
  .handler(async ({ data }) =>
    via("dbx.entries", data, async () => {
      const { listDropboxEntries } = await import("./dropbox.server");
      return listDropboxEntries(await tokenOf(data.token), data.path ?? "/");
    }),
  );

export const listFeedMedia = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenField, path: z.string().max(1000).optional() }))
  .handler(async ({ data }) =>
    via("dbx.feed", data, async () => {
      const { listDropboxMediaDeep } = await import("./dropbox.server");
      return { files: await listDropboxMediaDeep(await tokenOf(data.token), data.path || "/", 80) };
    }),
  );

export const getThumbnails = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: tokenField,
      paths: z.array(z.string().max(1000)).max(100),
      size: z.enum(["w256h256", "w640h480", "w1024h768"]).optional(),
    }),
  )
  .handler(async ({ data }) =>
    via("dbx.thumbs", data, async () => {
      const { getDropboxThumbnails } = await import("./dropbox.server");
      return getDropboxThumbnails(await tokenOf(data.token), data.paths, data.size ?? "w256h256");
    }),
  );

export const getTemporaryLink = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenField, path: z.string().min(1).max(1000) }))
  .handler(async ({ data }) =>
    via("dbx.link", data, async () => {
      const { getDropboxTemporaryLink } = await import("./dropbox.server");
      return getDropboxTemporaryLink(await tokenOf(data.token), data.path);
    }),
  );

export const ensureFolder = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenField, path: z.string().min(1).max(1000) }))
  .handler(async ({ data }) =>
    via("dbx.ensure", data, async () => {
      const { ensureDropboxFolder } = await import("./dropbox.server");
      return { path: await ensureDropboxFolder(await tokenOf(data.token), data.path) };
    }),
  );

export const uploadFile = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: tokenField,
      destPath: z.string().min(1).max(1000),
      mediaUrl: z.string().min(8).max(8000),
    }),
  )
  .handler(async ({ data }) =>
    via("dbx.upload", data, async () => {
      const { uploadMediaToDropbox } = await import("./dropbox.server");
      return uploadMediaToDropbox({ token: await tokenOf(data.token), destPath: data.destPath, mediaUrl: data.mediaUrl });
    }),
  );

export const exchangeDropboxOauth = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().min(4).max(2000),
      redirectUri: z.string().min(8).max(500),
      appKey: z.string().min(4).max(200),
      appSecret: z.string().min(4).max(200),
    }),
  )
  .handler(async ({ data }) =>
    via("dbx.exchange", data, async () => {
      const { exchangeDropboxCode } = await import("./oauth.server");
      return exchangeDropboxCode(data);
    }),
  );

export const refreshDropboxOauth = createServerFn({ method: "POST" })
  .validator(
    z.object({
      refreshToken: z.string().min(8).max(8000),
      appKey: z.string().min(4).max(200),
      appSecret: z.string().min(4).max(200),
    }),
  )
  .handler(async ({ data }) =>
    via("dbx.refresh", data, async () => {
      const { refreshDropboxAccess } = await import("./oauth.server");
      return refreshDropboxAccess(data);
    }),
  );

export const deleteDropboxFile = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenField, path: z.string().min(2).max(1000) }))
  .handler(async ({ data }) =>
    via("dbx.delete", data, async () => {
      const { deleteDropboxPath } = await import("./dropbox.server");
      return deleteDropboxPath(await tokenOf(data.token), data.path);
    }),
  );

export const moveDropboxFile = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: tokenField,
      from: z.string().min(2).max(1000),
      toFolder: z.string().min(1).max(1000),
    }),
  )
  .handler(async ({ data }) =>
    via("dbx.move", data, async () => {
      const { moveDropboxPath } = await import("./dropbox.server");
      return moveDropboxPath(await tokenOf(data.token), data.from, data.toFolder);
    }),
  );

export const deleteDropboxMany = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenField, paths: z.array(z.string().min(2).max(1000)).min(1).max(40) }))
  .handler(async ({ data }) =>
    via("dbx.deleteMany", data, async () => {
      const { deleteDropboxPaths } = await import("./dropbox.server");
      return deleteDropboxPaths(await tokenOf(data.token), data.paths);
    }),
  );

export const moveDropboxMany = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: tokenField,
      from: z.array(z.string().min(2).max(1000)).min(1).max(40),
      toFolder: z.string().min(1).max(1000),
    }),
  )
  .handler(async ({ data }) =>
    via("dbx.moveMany", data, async () => {
      const { moveDropboxPaths } = await import("./dropbox.server");
      return moveDropboxPaths(await tokenOf(data.token), data.from, data.toFolder);
    }),
  );

export const getShtoraMarks = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenField, paths: z.array(z.string().min(2).max(1000)).max(200) }))
  .handler(async ({ data }) =>
    via("dbx.photoMarks", data, async () => {
      const { readShtoraPhotoMarks } = await import("./dropbox.server");
      return readShtoraPhotoMarks(await tokenOf(data.token), data.paths);
    }),
  );

export const setShtoraMarks = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: tokenField,
      paths: z.array(z.string().min(2).max(1000)).min(1).max(40),
      tagged: z.boolean(),
    }),
  )
  .handler(async ({ data }) =>
    via("dbx.photoMarkSet", data, async () => {
      const { setShtoraPhotoMarks } = await import("./dropbox.server");
      return setShtoraPhotoMarks(await tokenOf(data.token), data.paths, data.tagged);
    }),
  );
