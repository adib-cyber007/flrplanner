import { Router, json } from "express";
import { z } from "zod";
import { ProjectSchema } from "../shared/model";
import { ProjectRepository, RepositoryError } from "./repository";

export function projectRoutes(repository: ProjectRepository) {
  const router = Router();
  router.use(json({ limit: "32mb" }));
  router.get("/", async (_req, res, next) => {
    try {
      res.json(await repository.list());
    } catch (e) {
      next(e);
    }
  });
  router.put("/:id", async (req, res, next) => {
    try {
      const body = z
        .object({
          project: ProjectSchema,
          expectedRevision: z.number().int().positive().nullable(),
        })
        .parse(req.body);
      if (body.project.id !== req.params.id)
        throw new RepositoryError("Project IDs do not match.", 400);
      res.json(await repository.save(body.project, body.expectedRevision));
    } catch (e) {
      next(e);
    }
  });
  router.get("/:id/versions", async (req, res, next) => {
    try {
      res.json(await repository.versions(req.params.id));
    } catch (e) {
      next(e);
    }
  });
  router.get("/:id/versions/:versionId", async (req, res, next) => {
    try {
      res.json(await repository.version(req.params.id, req.params.versionId));
    } catch (e) {
      next(e);
    }
  });
  router.post("/:id/versions", async (req, res, next) => {
    try {
      const body = z
        .object({
          expectedRevision: z.number().int().positive(),
          label: z.string().max(120),
        })
        .parse(req.body);
      res.json(
        await repository.checkpoint(
          req.params.id,
          body.expectedRevision,
          body.label,
        ),
      );
    } catch (e) {
      next(e);
    }
  });
  router.post("/:id/versions/:versionId/restore", async (req, res, next) => {
    try {
      const body = z
        .object({ expectedRevision: z.number().int().positive() })
        .parse(req.body);
      res.json(
        await repository.restore(
          req.params.id,
          req.params.versionId,
          body.expectedRevision,
        ),
      );
    } catch (e) {
      next(e);
    }
  });
  router.use(
    (
      error: Error,
      _req: import("express").Request,
      res: import("express").Response,
      _next: import("express").NextFunction,
    ) => {
      res
        .status(
          error instanceof RepositoryError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 500,
        )
        .json({
          error:
            error instanceof RepositoryError
              ? error.message
              : error instanceof z.ZodError
                ? "The project contains invalid data. Export a copy before making further edits."
                : "Could not access the studio files. Check the folder permissions and available disk space.",
        });
    },
  );
  return router;
}
