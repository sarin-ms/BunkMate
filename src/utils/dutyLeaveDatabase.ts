import { database } from "../db/database";
import { DutyLeave } from "../types/dutyLeave";
import * as FileSystem from "expo-file-system/legacy";

const DUTY_LEAVE_PREFIX = "duty_leave_";

export class DutyLeaveDatabase {
  static async saveDutyLeave(leave: DutyLeave): Promise<void> {
    try {
      const key = `${DUTY_LEAVE_PREFIX}${leave.id}`;
      await database.set(key, JSON.stringify(leave));
    } catch (error) {
      console.error("Error saving duty leave:", error);
      throw error;
    }
  }

  static async getDutyLeave(id: string): Promise<DutyLeave | null> {
    try {
      const key = `${DUTY_LEAVE_PREFIX}${id}`;
      const data = await database.get(key);
      if (data) {
        return JSON.parse(data) as DutyLeave;
      }
      return null;
    } catch (error) {
      console.error("Error getting duty leave:", error);
      return null;
    }
  }

  static async getAllDutyLeaves(): Promise<DutyLeave[]> {
    try {
      const allKeys = await database.getAllKeys();
      const dutyLeaveKeys = allKeys.filter((key) =>
        key.startsWith(DUTY_LEAVE_PREFIX),
      );

      const leaves: DutyLeave[] = [];

      for (const key of dutyLeaveKeys) {
        try {
          const data = await database.get(key);
          if (data) {
            const leave = JSON.parse(data) as DutyLeave;
            if (leave.hours === undefined) {
              if (leave.documentUri) {
                await this.deleteDocument(leave.documentUri);
              }
              await database.delete(key);
            } else {
              leaves.push(leave);
            }
          }
        } catch (parseError) {
          console.warn(
            `Failed to parse duty leave for key ${key}:`,
            parseError,
          );
        }
      }

      leaves.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      return leaves;
    } catch (error) {
      console.error("Error getting all duty leaves:", error);
      return [];
    }
  }

  static async deleteDutyLeave(id: string): Promise<void> {
    try {
      const leave = await this.getDutyLeave(id);
      if (leave?.documentUri) {
        await this.deleteDocument(leave.documentUri);
      }

      const key = `${DUTY_LEAVE_PREFIX}${id}`;
      await database.delete(key);
    } catch (error) {
      console.error("Error deleting duty leave:", error);
      throw error;
    }
  }

  static async updateDutyLeave(leave: DutyLeave): Promise<void> {
    try {
      const key = `${DUTY_LEAVE_PREFIX}${leave.id}`;
      const exists = await database.has(key);
      if (!exists) {
        throw new Error(`Duty leave with id ${leave.id} not found`);
      }
      await database.set(key, JSON.stringify(leave));
    } catch (error) {
      console.error("Error updating duty leave:", error);
      throw error;
    }
  }

  static async saveDocument(
    sourceUri: string,
    fileName: string,
  ): Promise<string> {
    try {
      const dir = `${FileSystem.documentDirectory}duty_leave_docs/`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }

      const uniqueName = `${Date.now()}_${fileName}`;
      const destUri = `${dir}${uniqueName}`;

      await FileSystem.copyAsync({
        from: sourceUri,
        to: destUri,
      });

      return destUri;
    } catch (error) {
      console.error("Error saving document:", error);
      throw error;
    }
  }

  static async deleteDocument(uri: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (error) {
      console.warn("Failed to delete document file:", error);
    }
  }
}
