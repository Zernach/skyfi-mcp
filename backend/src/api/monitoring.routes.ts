import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger';
import { monitoringService } from '../services/monitoring.service';

const router = Router();

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof ZodError) {
    return error.errors.map((err) => err.message).join(', ');
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const handleError = (res: Response, error: unknown): void => {
  const message = extractErrorMessage(error);
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: message,
      details: error.errors,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: message,
  });
};

router.get('/aois', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;

  if (!userId) {
    res.status(400).json({
      success: false,
      error: 'userId query parameter is required',
    });
    return;
  }

  try {
    const aois = await monitoringService.listAois(userId);
    res.json({
      success: true,
      aois,
    });
    return;
  } catch (error) {
    logger.error('Failed to list AOIs', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    handleError(res, error);
    return;
  }
});

router.post('/aois', async (req: Request, res: Response) => {
  const payload = req.body ?? {};

  try {
    const aoi = await monitoringService.createAoi(payload);
    res.status(201).json({
      success: true,
      aoi,
    });
    return;
  } catch (error) {
    logger.error('Failed to create AOI', {
      error: error instanceof Error ? error.message : String(error),
      payload,
    });
    handleError(res, error);
    return;
  }
});

router.put('/aois/:aoiId', async (req: Request, res: Response) => {
  const { aoiId } = req.params;
  const { userId, ...updates } = req.body ?? {};

  if (!userId) {
    res.status(400).json({
      success: false,
      error: 'userId is required',
    });
    return;
  }

  try {
    const aoi = await monitoringService.updateAoi(userId, aoiId, updates);
    res.json({
      success: true,
      aoi,
    });
    return;
  } catch (error) {
    logger.error('Failed to update AOI', {
      error: error instanceof Error ? error.message : String(error),
      aoiId,
      userId,
      updates,
    });
    handleError(res, error);
    return;
  }
});

router.delete('/aois/:aoiId', async (req: Request, res: Response) => {
  const { aoiId } = req.params;
  const userId = (req.query.userId as string) ?? (req.body?.userId as string);

  if (!userId) {
    res.status(400).json({
      success: false,
      error: 'userId is required',
    });
    return;
  }

  try {
    const aoi = await monitoringService.deleteAoi(userId, aoiId);
    res.json({
      success: true,
      aoi,
    });
    return;
  } catch (error) {
    logger.error('Failed to delete AOI', {
      error: error instanceof Error ? error.message : String(error),
      aoiId,
      userId,
    });
    handleError(res, error);
    return;
  }
});

export default router;

