import sys

def refactor():
    with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", "r") as f:
        content = f.read()

    # Find the tracks VStack
    start_str = """                        // Tracks
                        VStack(spacing: 0) {"""
    
    # We know it ends around line 5058
    
    # Let's locate the ForEach content
    foreach_start = content.find("ForEach(Array(album.tracks.enumerated()), id: \\.element.id) { index, track in")
    if foreach_start == -1:
        print("Cannot find ForEach")
        return
        
    start_bracket = content.find("{", foreach_start)
    
    # Find matching close bracket
    count = 0
    end_bracket = -1
    for i in range(start_bracket, len(content)):
        if content[i] == '{':
            count += 1
        elif content[i] == '}':
            count -= 1
            if count == 0:
                end_bracket = i
                break
                
    if end_bracket == -1:
        print("Cannot find end bracket")
        return
        
    foreach_content = content[start_bracket+1:end_bracket]
    
    # Replace the ForEach content with a function call
    new_foreach = "{\n                                trackRowView(index: index, track: track)\n                            }"
    
    # Function definition
    func_def = f"""
    @ViewBuilder
    private func trackRowView(index: Int, track: NativeTrack) -> some View {{{foreach_content}}}
"""
    
    # Insert function at the end of the struct
    struct_end = content.find("    private func triggerJSAction(")
    if struct_end == -1:
        print("Cannot find triggerJSAction")
        return
        
    new_content = content[:foreach_start] + "ForEach(Array(album.tracks.enumerated()), id: \\.element.id) { index, track in" + new_foreach + content[end_bracket+1:struct_end] + func_def + content[struct_end:]
    
    with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", "w") as f:
        f.write(new_content)
    print("Refactored successfully!")

refactor()
