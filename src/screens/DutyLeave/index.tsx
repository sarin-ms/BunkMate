import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  Alert,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
  isSameMonth,
} from "date-fns";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { useThemedStyles, useTheme } from "../../hooks/useTheme";
import { useAttendanceStore } from "../../state/attendance";
import { useDutyLeaveStore } from "../../state/dutyLeave";
import { DutyLeaveDatabase } from "../../utils/dutyLeaveDatabase";
import { ThemeColors } from "../../types/theme";
import { DutyLeave } from "../../types/dutyLeave";
import { TAB_BAR_HEIGHT } from "../../constants/config";
import {
  formatPercentage,
  calculateEnhancedAttendanceStats,
  normalizeAttendance,
} from "../../utils/helpers";
import Text from "../../components/UI/Text";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width } = Dimensions.get("window");
const CELL_SIZE = Math.floor((width * 0.9 - 40) / 7);

const AttendanceImpactCard: React.FC<{
  impacts: {
    subjectName: string;
    currentPercentage: number;
    projectedPercentage: number;
    matchingAbsentCount: number;
  }[];
}> = ({ impacts }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={[styles.impactCard, { paddingBottom: 12 }]}
    >
      <View style={styles.impactHeader}>
        <Ionicons name="analytics-outline" size={20} color={colors.primary} />
        <Text style={styles.impactTitle}>Subject-Wise Expected Impact</Text>
      </View>

      <View style={{ marginTop: 8 }}>
        {impacts.map((impact, idx) => {
          const diff = impact.projectedPercentage - impact.currentPercentage;
          if (diff <= 0 && impact.matchingAbsentCount === 0) return null;
          return (
            <View key={idx} style={styles.subjectImpactRow}>
              <Text style={styles.subjectImpactName} numberOfLines={1}>
                {impact.subjectName}
              </Text>
              {impact.matchingAbsentCount > 0 ? (
                <View style={styles.subjectImpactStats}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {formatPercentage(impact.currentPercentage)}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={colors.textSecondary}
                    style={{ marginHorizontal: 4 }}
                  />
                  <Text
                    style={{
                      color: colors.success,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    {formatPercentage(impact.projectedPercentage)}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  No Impact
                </Text>
              )}
            </View>
          );
        })}
        {impacts.every((i) => i.matchingAbsentCount === 0) && (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            No absent periods covered by duty leave yet.
          </Text>
        )}
      </View>
    </Animated.View>
  );
};

const DutyLeaveCard: React.FC<{
  leave: DutyLeave;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<DutyLeave>) => void;
  onEdit: (leave: DutyLeave) => void;
  hasCoverage?: boolean;
}> = ({ leave, onDelete, onUpdate, onEdit, hasCoverage = true }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  const handleDelete = () => {
    Alert.alert(
      "Delete Duty Leave",
      `Remove duty leave for ${format(new Date(leave.date), "dd MMM yyyy")}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(leave.id),
        },
      ],
    );
  };

  return (
    <Animated.View
      entering={SlideInDown.duration(300).springify()}
      style={styles.leaveCard}
    >
      <View style={styles.leaveCardHeader}>
        <View style={styles.leaveCardDateBadge}>
          <Text style={styles.leaveCardDay}>
            {format(new Date(leave.date), "dd")}
          </Text>
          <Text style={styles.leaveCardMonth}>
            {format(new Date(leave.date), "MMM")}
          </Text>
        </View>

        <View style={styles.leaveCardContent}>
          <Text style={styles.leaveCardDateFull}>
            {format(new Date(leave.date), "EEEE, do MMMM yyyy")}
          </Text>
          <Text style={styles.leaveCardReason} numberOfLines={2}>
            {leave.reason}
          </Text>
          <Text style={styles.leaveCardHours}>
            {leave.hours === "full_day"
              ? "Full Day"
              : `Hours: ${[...leave.hours].sort().join(", ")}`}
          </Text>
          {leave.documentUri && (
            <View style={styles.leaveCardDocBadge}>
              <Ionicons
                name={
                  leave.documentType === "pdf"
                    ? "document-text"
                    : "image-outline"
                }
                size={14}
                color={colors.primary}
              />
              <Text style={styles.leaveCardDocText} numberOfLines={1}>
                {leave.documentName || "Document attached"}
              </Text>
            </View>
          )}
          {hasCoverage === false && (
            <View style={styles.leaveCardWarning}>
              <Ionicons
                name="warning-outline"
                size={14}
                color={colors.warning}
              />
              <Text style={styles.leaveCardWarningText}>
                No absent periods covered by this leave.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.leaveCardActions}>
          <TouchableOpacity
            onPress={() => onUpdate(leave.id, { approved: !leave.approved })}
            style={[
              styles.leaveCardApproveBtn,
              leave.approved && styles.leaveCardApproved,
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={leave.approved ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={leave.approved ? colors.success : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onEdit(leave)}
            style={styles.leaveCardDeleteBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="create-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            style={styles.leaveCardDeleteBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

const CalendarModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onDateSelect: (date: Date) => void;
  selectedDate: Date | null;
}> = ({ visible, onClose, onDateSelect, selectedDate }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [displayMonth, setDisplayMonth] = useState(selectedDate || new Date());

  const calendarWeeks = useMemo(() => {
    const monthStart = startOfMonth(displayMonth);
    const monthEnd = endOfMonth(displayMonth);
    const weeks: (Date | null)[][] = [];
    let currentWeekStart = startOfWeek(monthStart);

    while (currentWeekStart <= monthEnd) {
      const weekEnd = endOfWeek(currentWeekStart);
      const days = eachDayOfInterval({
        start: currentWeekStart,
        end: weekEnd,
      });
      weeks.push(
        days.map((day) => (day >= monthStart && day <= monthEnd ? day : null)),
      );
      currentWeekStart = new Date(
        currentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
    }
    return weeks;
  }, [displayMonth]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      hardwareAccelerated
      statusBarTranslucent
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[styles.calendarModalContent]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.calendarHeader}>
            <TouchableOpacity
              onPress={() => setDisplayMonth(subMonths(displayMonth, 1))}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.calendarTitle}>
              {format(displayMonth, "MMMM yyyy")}
            </Text>
            <TouchableOpacity
              onPress={() => setDisplayMonth(addMonths(displayMonth, 1))}
            >
              <Ionicons name="chevron-forward" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.calendarGrid}>
            <View style={styles.dayLabelsRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day, index) => (
                  <View key={index} style={styles.dayLabelContainer}>
                    <Text
                      style={[styles.dayLabel, { color: colors.textSecondary }]}
                    >
                      {day.charAt(0)}
                    </Text>
                  </View>
                ),
              )}
            </View>
            {calendarWeeks.map((week, weekIndex) => (
              <View key={weekIndex} style={styles.weekRow}>
                {week.map((day, dayIndex) => {
                  if (!day) {
                    return (
                      <View
                        key={`empty-${weekIndex}-${dayIndex}`}
                        style={styles.cell}
                      />
                    );
                  }
                  const isSelected =
                    selectedDate && isSameDay(selectedDate, day);
                  const isTodayDate = isToday(day);

                  return (
                    <TouchableOpacity
                      key={day.toISOString()}
                      style={[
                        styles.cell,
                        styles.monthDay,
                        isTodayDate && !isSelected && styles.todayMarker,
                        isSelected && styles.selectedDay,
                      ]}
                      onPress={() => {
                        onDateSelect(day);
                        onClose();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          isSelected && styles.selectedDayText,
                        ]}
                      >
                        {format(day, "d")}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const AddDutyLeaveModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSave: (leave: Omit<DutyLeave, "id" | "createdAt">) => void;
  editingLeave?: DutyLeave | null;
}> = ({ visible, onClose, onSave, editingLeave }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [reason, setReason] = useState("");
  const [documentUri, setDocumentUri] = useState<string | undefined>();
  const [documentName, setDocumentName] = useState<string | undefined>();
  const [documentType, setDocumentType] = useState<
    "image" | "pdf" | undefined
  >();
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFullDay, setIsFullDay] = useState(true);
  const [selectedHours, setSelectedHours] = useState<number[]>([]);

  useEffect(() => {
    if (editingLeave && visible) {
      setSelectedDate(new Date(editingLeave.date));
      setReason(editingLeave.reason);
      setDocumentUri(editingLeave.documentUri);
      setDocumentName(editingLeave.documentName);
      setDocumentType(editingLeave.documentType);
      if (editingLeave.hours === "full_day") {
        setIsFullDay(true);
        setSelectedHours([]);
      } else {
        setIsFullDay(false);
        setSelectedHours([...editingLeave.hours]);
      }
    }
  }, [editingLeave, visible]);

  const resetForm = () => {
    setSelectedDate(null);
    setReason("");
    setDocumentUri(undefined);
    setDocumentName(undefined);
    setDocumentType(undefined);
    setIsSaving(false);
    setIsFullDay(true);
    setSelectedHours([]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const isPdf = asset.mimeType?.includes("pdf");
        setDocumentUri(asset.uri);
        setDocumentName(asset.name);
        setDocumentType(isPdf ? "pdf" : "image");
      }
    } catch (error) {
      console.error("Error picking document:", error);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileName =
          asset.uri.split("/").pop() || `photo_${Date.now()}.jpg`;
        setDocumentUri(asset.uri);
        setDocumentName(fileName);
        setDocumentType("image");
      }
    } catch (error) {
      console.error("Error picking image:", error);
    }
  };

  const handleSave = async () => {
    if (!selectedDate || !reason.trim()) return;
    setIsSaving(true);

    try {
      let savedDocUri: string | undefined;
      if (documentUri && documentName) {
        savedDocUri = await DutyLeaveDatabase.saveDocument(
          documentUri,
          documentName,
        );
      }

      onSave({
        date: format(selectedDate, "yyyy-MM-dd"),
        reason: reason.trim(),
        documentUri: savedDocUri,
        documentName,
        documentType,
        hours: isFullDay ? "full_day" : selectedHours,
        approved: false,
      });
      handleClose();
    } catch (error) {
      console.error("Error saving:", error);
      setIsSaving(false);
    }
  };

  const canSave =
    selectedDate &&
    reason.trim().length > 0 &&
    !isSaving &&
    (isFullDay || selectedHours.length > 0);

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.addModalContent}>
              {/* Header */}
              <View style={styles.addModalHeader}>
                <Text style={styles.addModalTitle}>
                  {editingLeave ? "Edit Duty Leave" : "Add Duty Leave"}
                </Text>
                <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
                  <Ionicons
                    name="close-circle"
                    size={28}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                {/* Date Picker */}
                <Text style={styles.fieldLabel}>Date *</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setCalendarVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.datePickerText,
                      !selectedDate && { color: colors.textSecondary },
                    ]}
                  >
                    {selectedDate
                      ? format(selectedDate, "EEEE, dd MMM yyyy")
                      : "Select a date"}
                  </Text>
                </TouchableOpacity>

                {/* Duration */}
                <Text style={styles.fieldLabel}>Duration *</Text>
                <View style={styles.durationTabsRow}>
                  <TouchableOpacity
                    style={[
                      styles.durationTab,
                      isFullDay && styles.durationTabActive,
                    ]}
                    onPress={() => setIsFullDay(true)}
                  >
                    <Text
                      style={[
                        styles.durationTabText,
                        isFullDay && styles.durationTabTextActive,
                      ]}
                    >
                      Full Day
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.durationTab,
                      !isFullDay && styles.durationTabActive,
                    ]}
                    onPress={() => setIsFullDay(false)}
                  >
                    <Text
                      style={[
                        styles.durationTabText,
                        !isFullDay && styles.durationTabTextActive,
                      ]}
                    >
                      Specific Hours
                    </Text>
                  </TouchableOpacity>
                </View>

                {!isFullDay && (
                  <View style={styles.hoursGrid}>
                    {[1, 2, 3, 4, 5, 6].map((hour) => {
                      const isSelected = selectedHours.includes(hour);
                      return (
                        <TouchableOpacity
                          key={hour}
                          style={[
                            styles.hourChip,
                            isSelected && styles.hourChipActive,
                          ]}
                          onPress={() => {
                            if (isSelected) {
                              setSelectedHours((prev) =>
                                prev.filter((h) => h !== hour),
                              );
                            } else {
                              setSelectedHours((prev) =>
                                [...prev, hour].sort(),
                              );
                            }
                          }}
                        >
                          <Text
                            style={[
                              styles.hourChipText,
                              isSelected && styles.hourChipTextActive,
                            ]}
                          >
                            Hour {hour}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Reason */}
                <Text style={styles.fieldLabel}>Reason *</Text>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="e.g. NSS Camp, Workshop, Sports Event..."
                  placeholderTextColor={colors.textSecondary}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                {/* Document Upload */}
                <Text style={styles.fieldLabel}>
                  Document{" "}
                  <Text style={{ color: colors.textSecondary }}>
                    (optional)
                  </Text>
                </Text>

                {documentUri ? (
                  <View style={styles.documentPreview}>
                    <Ionicons
                      name={
                        documentType === "pdf"
                          ? "document-text"
                          : "image-outline"
                      }
                      size={24}
                      color={colors.primary}
                    />
                    <Text style={styles.documentPreviewName} numberOfLines={1}>
                      {documentName}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setDocumentUri(undefined);
                        setDocumentName(undefined);
                        setDocumentType(undefined);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={colors.danger}
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadButtonsRow}>
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={handlePickDocument}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="document-attach-outline"
                        size={22}
                        color={colors.primary}
                      />
                      <Text style={styles.uploadButtonText}>
                        Pick PDF / Image
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={handlePickImage}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="camera-outline"
                        size={22}
                        color={colors.primary}
                      />
                      <Text style={styles.uploadButtonText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>

              {/* Save Button */}
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  !canSave && styles.saveButtonDisabled,
                ]}
                onPress={handleSave}
                disabled={!canSave}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>
                      {editingLeave ? "Update Duty Leave" : "Save Duty Leave"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CalendarModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        onDateSelect={setSelectedDate}
        selectedDate={selectedDate}
      />
    </>
  );
};

export const DutyLeaveScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [addModalVisible, setAddModalVisible] = useState(false);

  const {
    dutyLeaves,
    isLoading,
    fetchDutyLeaves,
    addDutyLeave,
    deleteDutyLeave,
    updateDutyLeave,
  } = useDutyLeaveStore();

  const { data: attendanceData, courseSchedule } = useAttendanceStore();

  useEffect(() => {
    fetchDutyLeaves();
  }, []);

  const subjectImpacts = useMemo(() => {
    if (!attendanceData || !courseSchedule) return [];

    const impacts = [];

    for (const subject of attendanceData.subjects) {
      const records = courseSchedule.get(subject.subject.id.toString()) || [];
      const stats = calculateEnhancedAttendanceStats(subject, records);

      const totalClasses = stats.totalClasses;
      const attendedClasses = stats.attendedClasses;
      const currentPercentage =
        totalClasses > 0 ? (attendedClasses / totalClasses) * 100 : 0;

      let matchingAbsentCount = 0;

      for (const leave of dutyLeaves) {
        const leaveDate = new Date(leave.date);
        const leaveDay = leaveDate.getDate();
        const leaveMonth = leaveDate.getMonth() + 1;
        const leaveYear = leaveDate.getFullYear();

        for (const entry of records) {
          if (
            entry.day === leaveDay &&
            entry.month === leaveMonth &&
            entry.year === leaveYear
          ) {
            let isCovered = false;
            if (leave.hours === "full_day") {
              isCovered = true;
            } else if (Array.isArray(leave.hours)) {
              isCovered = leave.hours.includes(entry.hour);
            }

            if (isCovered) {
              const status = normalizeAttendance(
                entry.final_attendance ||
                  entry.user_attendance ||
                  entry.teacher_attendance,
              );
              if (status === "absent") {
                matchingAbsentCount++;
              }
            }
          }
        }
      }

      const projectedAttended = attendedClasses + matchingAbsentCount;
      const projectedPercentage =
        totalClasses > 0 ? (projectedAttended / totalClasses) * 100 : 0;

      impacts.push({
        subjectName: subject.subject.name,
        currentPercentage: Math.round(currentPercentage * 100) / 100,
        projectedPercentage: Math.round(projectedPercentage * 100) / 100,
        matchingAbsentCount,
      });
    }

    return impacts;
  }, [attendanceData, courseSchedule, dutyLeaves]);

  const leaveCoverageMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    if (!attendanceData || !courseSchedule) return map;

    dutyLeaves.forEach((leave) => {
      let isApplied = false;
      const leaveDate = new Date(leave.date);
      const leaveDay = leaveDate.getDate();
      const leaveMonth = leaveDate.getMonth() + 1;
      const leaveYear = leaveDate.getFullYear();

      for (const subject of attendanceData.subjects) {
        const records = courseSchedule.get(subject.subject.id.toString()) || [];
        for (const entry of records) {
          if (
            entry.day === leaveDay &&
            entry.month === leaveMonth &&
            entry.year === leaveYear
          ) {
            let isCovered = false;
            if (leave.hours === "full_day") {
              isCovered = true;
            } else if (Array.isArray(leave.hours)) {
              isCovered = leave.hours.includes(entry.hour);
            }

            if (isCovered) {
              const status = normalizeAttendance(
                entry.final_attendance ||
                  entry.user_attendance ||
                  entry.teacher_attendance,
              );
              if (status === "absent") {
                isApplied = true;
                break;
              }
            }
          }
        }
        if (isApplied) break;
      }
      map[leave.id] = isApplied;
    });

    return map;
  }, [attendanceData, courseSchedule, dutyLeaves]);

  const [editingLeave, setEditingLeave] = useState<DutyLeave | null>(null);

  const handleAddDutyLeave = async (
    data: Omit<DutyLeave, "id" | "createdAt">,
  ) => {
    if (editingLeave) {
      await updateDutyLeave(editingLeave.id, {
        ...data,
      });
      setEditingLeave(null);
    } else {
      const newLeave: DutyLeave = {
        ...data,
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
      };
      await addDutyLeave(newLeave);
    }
  };

  const handleEditDutyLeave = (leave: DutyLeave) => {
    setEditingLeave(leave);
    setAddModalVisible(true);
  };

  const handleDeleteDutyLeave = async (id: string) => {
    await deleteDutyLeave(id);
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name="document-text-outline"
        size={64}
        color={colors.textSecondary + "60"}
      />
      <Text style={styles.emptyTitle}>No Duty Leaves</Text>
      <Text style={styles.emptyMessage}>
        Tap the button below to log a duty leave.{"\n"}Duty leaves can be
        claimed with a valid signed document.
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Duty Leave</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Attendance Impact Card - rendered outside FlatList for reliable reactivity */}
      {attendanceData &&
        dutyLeaves.length > 0 &&
        subjectImpacts.length > 0 && (
          <View style={{ paddingHorizontal: 16 }}>
            <AttendanceImpactCard impacts={subjectImpacts} />
          </View>
        )}

      <FlatList
        data={dutyLeaves}
        renderItem={({ item }) => (
          <DutyLeaveCard
            leave={item}
            onDelete={handleDeleteDutyLeave}
            onUpdate={updateDutyLeave}
            onEdit={handleEditDutyLeave}
            hasCoverage={leaveCoverageMap[item.id] !== false}
          />
        )}
        keyExtractor={(item) => item.id}
        extraData={leaveCoverageMap}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 100,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          dutyLeaves.length > 0 ? (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>
                Your Duty Leaves ({dutyLeaves.length})
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setAddModalVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Modal */}
      <AddDutyLeaveModal
        visible={addModalVisible}
        onClose={() => {
          setAddModalVisible(false);
          setEditingLeave(null);
        }}
        onSave={handleAddDutyLeave}
        editingLeave={editingLeave}
      />
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.text,
    },

    impactCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginVertical: 12,
      borderWidth: 1,
      borderColor: colors.border + "40",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    impactHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
    },
    impactTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    impactStatsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
    },
    impactStatItem: {
      alignItems: "center",
      gap: 4,
    },
    impactStatLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: "500",
    },
    impactStatValue: {
      fontSize: 24,
      fontWeight: "800",
    },
    impactFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border + "40",
    },
    impactFooterText: {
      fontSize: 12,
      fontWeight: "500",
    },
    impactBadge: {
      position: "absolute",
      top: 14,
      right: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.success + "18",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    impactBadgeText: {
      fontSize: 13,
      fontWeight: "700",
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
      marginBottom: 12,
    },
    sectionDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },

    leaveCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border + "40",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    leaveCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    leaveCardDateBadge: {
      width: 48,
      height: 52,
      borderRadius: 12,
      backgroundColor: colors.primary + "14",
      borderWidth: 1,
      borderColor: colors.primary + "30",
      alignItems: "center",
      justifyContent: "center",
    },
    leaveCardDay: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.primary,
      lineHeight: 22,
    },
    leaveCardMonth: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.primary,
      textTransform: "uppercase",
    },
    leaveCardContent: {
      flex: 1,
      gap: 3,
    },
    leaveCardDateFull: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
    },
    leaveCardReason: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    leaveCardDocBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 4,
      backgroundColor: colors.primary + "10",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      alignSelf: "flex-start",
    },
    leaveCardDocText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.primary,
      maxWidth: 120,
    },
    leaveCardDeleteBtn: {
      padding: 8,
    },

    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingTop: 60,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      marginTop: 16,
    },
    emptyMessage: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 8,
      lineHeight: 20,
    },

    fab: {
      position: "absolute",
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },

    addModalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 30,
      maxHeight: "85%",
    },
    addModalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    addModalTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
    },
    fieldLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
      marginTop: 12,
    },
    datePickerButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.primary,
      backgroundColor: colors.primary + "08",
    },
    datePickerText: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: colors.primary,
    },
    reasonInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      fontSize: 15,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 80,
    },
    uploadButtonsRow: {
      flexDirection: "row",
      gap: 10,
    },
    uploadButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.primary + "60",
      backgroundColor: colors.primary + "08",
    },
    uploadButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
    },
    documentPreview: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.primary + "10",
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.primary + "30",
    },
    documentPreviewName: {
      flex: 1,
      fontSize: 14,
      fontWeight: "500",
      color: colors.text,
    },
    saveButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      padding: 16,
      marginTop: 20,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#fff",
    },

    durationTabsRow: {
      flexDirection: "row",
      backgroundColor: colors.border,
      borderRadius: 12,
      padding: 4,
      marginBottom: 16,
    },
    durationTab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: 8,
    },
    durationTabActive: {
      backgroundColor: colors.surface,
    },
    durationTabText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    durationTabTextActive: {
      color: colors.primary,
    },
    hoursGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    hourChip: {
      flex: 1,
      minWidth: "30%",
      backgroundColor: colors.border,
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "transparent",
    },
    hourChipActive: {
      backgroundColor: colors.primary + "10",
      borderColor: colors.primary,
    },
    hourChipText: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.textSecondary,
    },
    hourChipTextActive: {
      color: colors.primary,
    },

    leaveCardHours: {
      fontSize: 12,
      color: colors.primary,
      marginTop: 4,
      fontWeight: "500",
    },
    leaveCardActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    leaveCardApproveBtn: {
      padding: 8,
      borderRadius: 12,
      backgroundColor: colors.border,
    },
    leaveCardApproved: {
      backgroundColor: colors.success + "15",
    },
    leaveCardWarning: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      marginTop: 8,
      backgroundColor: colors.warning + "15",
      padding: 8,
      borderRadius: 8,
    },
    leaveCardWarningText: {
      fontSize: 12,
      color: colors.warning,
      flex: 1,
    },

    subjectImpactRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    subjectImpactName: {
      flex: 1,
      fontSize: 13,
      fontWeight: "500",
      color: colors.text,
      marginRight: 8,
    },
    subjectImpactStats: {
      flexDirection: "row",
      alignItems: "center",
    },

    calendarModalContent: {
      width: "90%",
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      alignSelf: "center",
      position: "absolute",
      top: "25%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    },
    calendarHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    calendarTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.text,
    },
    calendarGrid: {
      alignItems: "center",
    },
    dayLabelsRow: {
      flexDirection: "row",
      width: "100%",
      marginBottom: 8,
    },
    dayLabelContainer: {
      width: CELL_SIZE,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    dayLabel: {
      fontSize: 10,
      fontWeight: "500",
    },
    weekRow: {
      flexDirection: "row",
      width: "100%",
      marginBottom: 2,
      justifyContent: "space-between",
    },
    cell: {
      width: CELL_SIZE - 2,
      height: CELL_SIZE - 2,
      borderRadius: 4,
      margin: 1,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    monthDay: {
      backgroundColor: colors.border,
    },
    todayMarker: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    selectedDay: {
      backgroundColor: colors.primary,
    },
    dayNumber: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.text,
    },
    selectedDayText: {
      color: "#fff",
      fontWeight: "700",
    },
  });
