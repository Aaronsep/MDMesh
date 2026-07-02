/*
 * MDMesh agent-v1: queues a device's configuration apps for installation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 */

package com.hmdm.rest.resource.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hmdm.notification.AgentWakeHub;
import com.hmdm.persistence.AgentCommandDAO;
import com.hmdm.persistence.UnsecureDAO;
import com.hmdm.persistence.domain.AgentCommand;
import com.hmdm.persistence.domain.Application;
import com.hmdm.persistence.domain.Device;
import com.hmdm.util.RolloutProgress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.inject.Inject;
import javax.inject.Singleton;
import java.util.List;

/**
 * Turns a device's configuration app list into queued {@code app.install} commands — the piece
 * that makes a configuration a "golden image" for the command-driven agent (which never reads the
 * configuration itself). Used at enrollment and by the admin "sync apps" action.
 */
@Singleton
public class ConfigAppInstaller {

    private static final Logger logger = LoggerFactory.getLogger(ConfigAppInstaller.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Action value in configurationApplications meaning "install this app". */
    private static final int ACTION_INSTALL = 1;

    private final UnsecureDAO unsecureDAO;
    private final AgentCommandDAO commandDAO;
    private final AgentWakeHub wakeHub;

    @Inject
    public ConfigAppInstaller(UnsecureDAO unsecureDAO, AgentCommandDAO commandDAO, AgentWakeHub wakeHub) {
        this.unsecureDAO = unsecureDAO;
        this.commandDAO = commandDAO;
        this.wakeHub = wakeHub;
    }

    /**
     * Queue an {@code app.install} for every action=install app of the device's configuration
     * that has a real hosted APK URL. Returns the number queued. Never throws — callers treat
     * this as best-effort (enrollment must not fail because an app list is dirty).
     */
    public int enqueueConfigApps(Device device) {
        if (device == null || device.getConfigurationId() == null) {
            return 0;
        }
        int queued = 0;
        try {
            List<Application> apps = unsecureDAO.getPlainConfigurationApplications(
                    device.getCustomerId(), device.getConfigurationId());
            long now = System.currentTimeMillis();
            for (Application app : apps) {
                if (app == null || app.getAction() != ACTION_INSTALL) {
                    continue;
                }
                String url = firstUsableUrl(app);
                if (url == null || app.getPkg() == null || app.getPkg().trim().isEmpty()) {
                    // Catalog placeholder / web app / seed leftover — nothing downloadable.
                    continue;
                }
                AgentCommand cmd = new AgentCommand();
                cmd.setDeviceNumber(device.getNumber());
                cmd.setType("app.install");
                cmd.setPayload(installPayload(app, url));
                cmd.setRequiresCapability(RolloutProgress.INSTALL_CAPABILITY);
                cmd.setStatus("pending");
                cmd.setCreatedAt(now);
                commandDAO.insert(cmd);
                queued++;
            }
            if (queued > 0) {
                wakeHub.wake(device.getNumber(), "commands");
            }
        } catch (Exception e) {
            logger.warn("Failed to queue configuration apps for device {}", device.getNumber(), e);
        }
        return queued;
    }

    /**
     * Only http(s) URLs are installable by the agent, and the upstream seed ships literal
     * placeholder URLs (e.g. {@code .../_HMDM_APK_}) that must never reach a device.
     */
    private static String firstUsableUrl(Application app) {
        for (String candidate : new String[]{app.getUrl(), app.getUrlArm64(), app.getUrlArmeabi()}) {
            if (candidate == null) {
                continue;
            }
            String u = candidate.trim();
            if ((u.startsWith("https://") || u.startsWith("http://")) && !u.contains("_HMDM_")) {
                return u;
            }
        }
        return null;
    }

    // sha256 is intentionally omitted: the library stores hex hashes while the agent verifier
    // expects base64 — a mismatched format hard-fails the install. Delivery integrity rides TLS.
    private static String installPayload(Application app, String url) {
        ObjectNode p = MAPPER.createObjectNode();
        p.put("url", url);
        p.put("packageName", app.getPkg().trim());
        if (app.getVersionCode() > 0) {
            p.put("versionCode", app.getVersionCode());
        }
        return p.toString();
    }
}
