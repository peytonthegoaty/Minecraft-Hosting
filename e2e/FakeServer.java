// A stand-in for a Minecraft server used by the end-to-end test: prints Paper-style logs,
// answers console commands and speaks RCON, so Crab Host can be exercised without Mojang downloads.
import java.io.*;
import java.net.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class FakeServer {
    static final String PLAYERS = "There are 2 of a max of 20 players online: Alex_Builds, Creeper99";

    static void log(String level, String msg) {
        System.out.println("[" + LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss")) + " " + level + "]: " + msg);
        System.out.flush();
    }

    public static void main(String[] args) throws Exception {
        Properties props = new Properties();
        try (Reader r = Files.newBufferedReader(Path.of("server.properties"))) { props.load(r); } catch (IOException ignored) {}
        log("INFO", "Starting minecraft server version 1.21.4");
        log("INFO", "Max memory: " + (Runtime.getRuntime().maxMemory() / 1024 / 1024) + " MB");
        log("INFO", "Starting Minecraft server on *:" + props.getProperty("server-port", "25565"));
        if ("true".equals(props.getProperty("enable-rcon"))) {
            int port = Integer.parseInt(props.getProperty("rcon.port", "25575"));
            String password = props.getProperty("rcon.password", "");
            Thread t = new Thread(() -> rcon(port, password));
            t.setDaemon(true);
            t.start();
            log("INFO", "RCON running on 0.0.0.0:" + port);
        }
        Thread.sleep(400);
        log("INFO", "Done (0.512s)! For help, type \"help\"");
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String cmd = line.trim();
            if (cmd.equals("stop")) {
                log("INFO", "Stopping the server");
                log("INFO", "Saving worlds");
                System.exit(0);
            } else if (cmd.equals("list")) {
                log("INFO", PLAYERS);
            } else if (cmd.startsWith("say ")) {
                log("INFO", "[Server] " + cmd.substring(4));
            } else if (cmd.startsWith("save-all")) {
                log("INFO", "Saved the game");
            } else if (!cmd.isEmpty()) {
                log("INFO", "Unknown or incomplete command: " + cmd);
            }
        }
    }

    static void rcon(int port, String password) {
        try (ServerSocket ss = new ServerSocket(port, 5, InetAddress.getLoopbackAddress())) {
            while (true) {
                Socket s = ss.accept();
                new Thread(() -> serve(s, password)).start();
            }
        } catch (IOException e) {
            log("WARN", "RCON stopped: " + e.getMessage());
        }
    }

    static void serve(Socket s, String password) {
        try (s; DataInputStream in = new DataInputStream(s.getInputStream()); OutputStream out = s.getOutputStream()) {
            boolean authed = false;
            while (true) {
                int len = Integer.reverseBytes(in.readInt());
                byte[] buf = new byte[len];
                in.readFully(buf);
                ByteBuffer b = ByteBuffer.wrap(buf).order(ByteOrder.LITTLE_ENDIAN);
                int id = b.getInt();
                int type = b.getInt();
                String body = new String(buf, 8, len - 10, StandardCharsets.UTF_8);
                if (type == 3) {
                    authed = body.equals(password);
                    send(out, authed ? id : -1, 2, "");
                } else if (authed) {
                    String reply = body.equals("list") ? PLAYERS : body.equals("tps") ? "§6TPS from last 1m, 5m, 15m: §a20.0, §a20.0, §a19.98" : "Unknown command";
                    send(out, id, 0, reply);
                }
            }
        } catch (IOException ignored) {}
    }

    static void send(OutputStream out, int id, int type, String body) throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        ByteBuffer b = ByteBuffer.allocate(14 + payload.length).order(ByteOrder.LITTLE_ENDIAN);
        b.putInt(10 + payload.length).putInt(id).putInt(type).put(payload).put((byte) 0).put((byte) 0);
        out.write(b.array());
        out.flush();
    }
}
